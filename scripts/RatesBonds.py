from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"


@dataclass
class PanelRow:
    date: str          # YYYY-MM-DD (first of month)
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def compute_changes(
    values: List[float],
) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
    """
    Compute:
    - month-over-month % change
    - year-over-year % change
    - 3-month trailing moving average (level)
    """
    n = len(values)
    mom: List[Optional[float]] = [None] * n
    yoy: List[Optional[float]] = [None] * n
    ma3: List[float] = [0.0] * n

    for i, v in enumerate(values):
        window = values[max(0, i - 2) : i + 1]
        ma3[i] = sum(window) / len(window)

        if i > 0 and values[i - 1] != 0:
            mom[i] = (v / values[i - 1] - 1.0) * 100.0

        if i >= 12 and values[i - 12] != 0:
            yoy[i] = (v / values[i - 12] - 1.0) * 100.0

    return mom, yoy, ma3


def fetch_boc_series_monthly(
    series_ids: List[str],
    start: str = "2000-01-01",
    end: Optional[str] = None,
) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more Bank of Canada Valet series and aggregate to monthly levels.
    For each calendar month we keep the *last* available daily observation.
    """
    base = "https://www.bankofcanada.ca/valet/observations"

    # month_key -> series_id -> last daily value seen in that month
    monthly_last: Dict[str, Dict[str, float]] = defaultdict(dict)

    for sid in series_ids:
        params = f"?start_date={start}"
        if end:
            params += f"&end_date={end}"
        url = f"{base}/{sid}/json{params}"

        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                payload = json.load(resp)
        except (HTTPError, URLError, TimeoutError, ValueError) as e:
            print(f"[WARN] BoC Valet fetch failed for {sid}: {e}")
            continue

        observations = payload.get("observations", [])
        for o in observations:
            d_str = o.get("d")
            if not d_str:
                continue

            try:
                d = datetime.fromisoformat(d_str[:10]).date()
            except Exception:
                continue

            month_key = date(d.year, d.month, 1).isoformat()

            v_obj = o.get(sid)
            if not isinstance(v_obj, dict):
                continue
            v_str = v_obj.get("v")
            if v_str is None:
                continue
            try:
                v = float(v_str)
            except Exception:
                continue

            monthly_last[month_key][sid] = v

    monthly: Dict[str, Dict[str, float]] = {}
    for month_key, per_sid in monthly_last.items():
        monthly[month_key] = dict(per_sid)

    return monthly


def generate_rates_from_boc() -> List[PanelRow]:
    """
    Generate rates data using real Bank of Canada series via the Valet API.

    Metrics → BoC series:
      - policy_rate      -> V39079    (Target for the overnight rate, %)
      - gov_2y_yield     -> V122538   (2-year GoC benchmark bond yield, %)
      - repo_volume      -> V44201362 (overnight repo operations volume, billions of dollars)
      - gov_10y_yield    -> V122487   (Long-term GoC bond yield >10y, %)
      - mortgage_5y      -> V80691311 (Prime rate, %)
    """
    rows: List[PanelRow] = []
    region = "canada"

    # NOTE:
    # - V44201362 is reported in *millions* of dollars.
    #   We convert to *billions* below.
    series_by_metric: Dict[str, Tuple[str, str]] = {
        "policy_rate": ("V39079", "pct"),
        "gov_2y_yield": ("V122538", "pct"),
        "repo_volume": ("V44201362", "billions"),  # <- unit label for the dashboard
        "gov_10y_yield": ("V122487", "pct"),
        "mortgage_5y": ("V80691311", "pct"),
    }

    all_series_ids = [cfg[0] for cfg in series_by_metric.values()]

    # Fetch daily/weekly observations and collapse to monthly
    monthly = fetch_boc_series_monthly(all_series_ids, start="2000-01-01")
    if not monthly:
        return []

    for metric, (series_id, unit) in series_by_metric.items():
        month_keys = sorted(
            d
            for d, per_sid in monthly.items()
            if series_id in per_sid and per_sid[series_id] is not None
        )
        if not month_keys:
            continue

        # Raw values (BoC units)
        vals: List[float] = [monthly[d][series_id] for d in month_keys]

        
        # Convert repo volume from millions → billions, BEFORE computing MoM/YoY/MA3
        if metric == "repo_volume":
            vals = [v * 1000 for v in vals]  # millions → billions
        
        mom, yoy, ma3 = compute_changes(vals)

        for dt_str, val, m, y, ma in zip(month_keys, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt_str,
                    region=region,
                    segment="all",
                    metric=metric,
                    value=round(val, 3),
                    unit=unit,
                    source="boc_valet",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

    return rows

def generate_rates() -> List[PanelRow]:
    """
    Top-level wrapper for BoC rates.
    If BoC is unavailable, we return an empty list (no synthetic fallback).
    """
    try:
        rows = generate_rates_from_boc()
        print(f"[INFO] Loaded {len(rows)} rate rows from BoC Valet")
        return rows
    except Exception as e:
        print(f"[ERROR] generate_rates_from_boc failed: {e!r}")
        return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rates = generate_rates()
    out_path = DATA_DIR / "rates_bonds.json"
    write_json(out_path, rates)
    print(f"Wrote {len(rates)} rate rows to {out_path}")


if __name__ == "__main__":
    main()
