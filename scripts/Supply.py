from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"  # kept for consistency, not used now

# StatCan Web Data Service base URL
WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


@dataclass
class PanelRow:
    date: str          # "YYYY-MM-DD" (use the first of the month)
    region: str        # always "canada"
    segment: str       # "total_residential" | "single" | "row" | "apartment" | "all" (for vacancy)
    metric: str        # "housing_starts" | "under_construction" |
                       # "completions" | "investment_construction" | "vacancy_rate"
    value: float
    unit: str          # "count" | "cad" | "pct"
    source: str        # "statcan_34-10-0154-01" | "statcan_34-10-0130-01" | "statcan_34-10-0293-01"
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


# ---------------------------------------------------------------------------
# StatCan WDS helpers
# ---------------------------------------------------------------------------

def fetch_statcan_series(vector_id: int, latest_n: int = 2000) -> Dict[str, float]:
    """
    Generic helper to fetch a single StatCan vector as a date->value series
    using the Web Data Service (WDS).

    We keep only data points where symbolCode is 0 or missing, and convert
    refPer values like "2024-10" into "YYYY-MM-01" ISO date strings.

    NOTE: These StatCan series are *monthly levels* (often seasonally adjusted),
    not annualized. We therefore do **not** divide by 12.
    """
    base_url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"
    payload = [{"vectorId": int(vector_id), "latestN": latest_n}]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        base_url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.load(resp)
    except (HTTPError, URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] StatCan WDS fetch failed for {vector_id}: {e}")
        return {}

    if not isinstance(res, list) or not res:
        print(f"[WARN] StatCan WDS response not a non-empty list for {vector_id}")
        return {}

    series: Dict[str, float] = {}

    for entry in res:
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}
        for dp in obj.get("vectorDataPoint", []):
            value = dp.get("value")
            symbol = dp.get("symbolCode")

            if value in (None, "", "NaN"):
                continue
            # Keep only normal values
            if symbol not in (0, None):
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue
            # Normalize "YYYY-MM" to "YYYY-MM-01"
            if len(ref) == 7:
                ref = ref + "-01"
            try:
                d = datetime.fromisoformat(ref[:10]).date()
            except Exception:
                continue

            key = date(d.year, d.month, 1).isoformat()
            series[key] = v

    return series


def fetch_vacancy_rate() -> Dict[str, float]:
    """
    Rental vacancy rate (%) for Canada, row & apartment structures of
    3+ units, privately initiated.

    StatCan table 34-10-0130-01, vector v1930301.
    """
    return fetch_statcan_series(1930301)


# Mapping of housing metrics + dwelling type (segment) to StatCan vector IDs.
#
# These vectors all come from the CMHC housing estimates tables:
#  - Housing starts, units under construction, completions:
#    table 34-10-0154-01 / 34-10-0156-01 (CMHC housing estimates)
#  - Investment in building construction:
#    table 34-10-0293-01 (Investment in Building Construction)
#
# All are monthly levels (typically seasonally adjusted).
STATCAN_HOUSING_VECTORS: Dict[str, Dict[str, int]] = {
    # Total residential (all structure types)
    "total_residential": {
        "housing_starts": 42127250,
        "under_construction": 42127255,
        "completions": 42127260,
        "investment_construction": 1705315944,
    },
    # Single detached dwellings
    "single": {
        "housing_starts": 42127251,
        "under_construction": 42127256,
        "completions": 42127261,
        "investment_construction": 1705315964,
    },
    # Row dwellings
    "row": {
        "housing_starts": 42127253,
        "under_construction": 42127258,
        "completions": 42127263,
        "investment_construction": 1705316104,
    },
    # Apartment and other multi-unit dwellings
    "apartment": {
        "housing_starts": 42127254,
        "under_construction": 42127259,
        "completions": 42127264,
        "investment_construction": 1705316124,
    },
}


def _series_to_panel_rows(
    metric: str,
    series: Dict[str, float],
    unit: str,
    source: str,
    segment: str,
) -> List[PanelRow]:
    if not series:
        return []

    items = sorted(series.items())  # sort by date string "YYYY-MM-DD"
    dates = [d for d, _ in items]
    values = [float(v) for _, v in items]

    mom, yoy, ma3 = compute_changes(values)

    rows: List[PanelRow] = []
    for dt, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt,
                region="canada",
                segment=segment,
                metric=metric,
                value=round(val, 3),
                unit=unit,
                source=source,
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )
    return rows


def generate_supply() -> List[PanelRow]:
    """
    Generate the Supply tab panel rows using StatCan data only:

      - housing_starts           (StatCan, CMHC housing estimates)
      - under_construction       (StatCan, CMHC housing estimates)
      - completions              (StatCan, CMHC housing estimates)
      - investment_construction  (StatCan 34-10-0293-01)
      - vacancy_rate             (StatCan 34-10-0130-01)

    All metrics are Canada aggregate. Dwelling type is encoded in the
    `segment` field as one of:
      - "total_residential"
      - "single"
      - "row"
      - "apartment"

    The vacancy_rate metric is stored with segment="all".
    """
    rows: List[PanelRow] = []

    # Housing starts / under construction / completions / investment by dwelling type.
    for segment, metric_vectors in STATCAN_HOUSING_VECTORS.items():
        for metric, vector_id in metric_vectors.items():
            series = fetch_statcan_series(vector_id)
            if not series:
                continue

            if metric == "investment_construction":
                unit = "cad"
                source = "statcan_34-10-0293-01"
            else:
                unit = "count"
                # All three physical pipeline metrics ultimately come from the
                # CMHC housing estimates tables 34-10-0154-01 / 34-10-0156-01.
                source = "statcan_34-10-0154-01"

            rows.extend(
                _series_to_panel_rows(
                    metric=metric,
                    series=series,
                    unit=unit,
                    source=source,
                    segment=segment,
                )
            )

    # Rental vacancy rate (no dwelling-type breakdown)
    vacancy_series = fetch_vacancy_rate()
    rows.extend(
        _series_to_panel_rows(
            metric="vacancy_rate",
            series=vacancy_series,
            unit="pct",
            source="statcan_34-10-0130-01",
            segment="all",
        )
    )

    return rows


# Backwards-compat alias so existing imports still work if they
# expect generate_supply_pipeline().
def generate_supply_pipeline() -> List[PanelRow]:  # pragma: no cover - simple alias
    return generate_supply()


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_supply()
    out_path = DATA_DIR / "supply.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} supply rows to {out_path}")


if __name__ == "__main__":
    main()
