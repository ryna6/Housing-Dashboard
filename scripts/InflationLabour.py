from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"  # kept for symmetry, not used directly


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


# ---------------------------------------------------------------------------
# StatCan – CPI, wage index, unemployment
# ---------------------------------------------------------------------------

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


def fetch_statcan_cpi() -> Dict[str, Dict[str, float]]:
    """
    Fetch CPI index series for Canada from Statistics Canada Web Data Service.

    We use the following vectors (table 18-10-0004-01, 2002=100):
      - cpi_headline: v41690973  (All-items)
      - cpi_shelter:  v41691055  (Owned accommodation)
      - cpi_rent:     v41691052  (Rent)
    """
    base_url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"

    vector_ids: Dict[str, int] = {
        "cpi_headline": 41690973,
        "cpi_shelter": 41691055,
        "cpi_rent": 41691052,
    }

    payload = [{"vectorId": vid, "latestN": 2000} for vid in vector_ids.values()]
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
        print(f"[WARN] StatCan CPI fetch failed: {e}")
        return {}

    series: Dict[str, Dict[str, float]] = {m: {} for m in vector_ids.keys()}
    vector_to_metric = {vid: m for m, vid in vector_ids.items()}

    if not isinstance(res, list):
        print("[WARN] Unexpected StatCan WDS response format for CPI")
        return {}

    for entry in res:
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}
        vid = obj.get("vectorId")
        metric = vector_to_metric.get(vid)
        if not metric:
            continue

        for dp in obj.get("vectorDataPoint", []):
            value = dp.get("value")
            symbol = dp.get("symbolCode")

            if value in (None, "", "NaN"):
                continue
            # Keep only normal values (0) or missing symbol; drop others.
            if symbol not in (0, None):
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue
            if len(ref) == 7:  # "YYYY-MM"
                ref = ref + "-01"
            try:
                d = datetime.fromisoformat(ref[:10]).date()
            except Exception:
                continue

            key = date(d.year, d.month, 1).isoformat()
            series[metric][key] = v

    return series


def fetch_statcan_wage_index() -> Dict[str, float]:
    """
    Wage index from StatCan table 14-10-0222-01 (SEPH):
    Average weekly earnings including overtime for all employees,
    industrial aggregate excluding unclassified businesses, Canada,
    monthly, seasonally adjusted.

    We use vector v54027306.

    Returns:
        { "YYYY-MM-01": value_in_dollars }
    """
    base_url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"

    payload = [{"vectorId": 54027306, "latestN": 2000}]
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
        print(f"[WARN] StatCan wage index fetch failed: {e}")
        return {}

    per_date: Dict[str, float] = {}

    if not isinstance(res, list) or not res:
        print("[WARN] StatCan wage index response not a non-empty list")
        return {}

    entry = res[0]
    if entry.get("status") != "SUCCESS":
        print(f"[WARN] StatCan wage index status: {entry.get('status')}")
        return {}

    obj = entry.get("object") or {}
    points = obj.get("vectorDataPoint", [])

    for dp in points:
        value = dp.get("value")
        symbol = dp.get("symbolCode")

        if value in (None, "", "NaN"):
            continue
        if symbol not in (0, None, "", "E"):
            continue

        try:
            v = float(value)
        except (TypeError, ValueError):
            continue

        ref = dp.get("refPer") or dp.get("refPerRaw")
        if not ref:
            continue

        if len(ref) == 7:  # "YYYY-MM"
            ref = ref + "-01"
        try:
            d = datetime.fromisoformat(ref[:10]).date()
        except Exception:
            continue

        key = date(d.year, d.month, 1).isoformat()
        per_date[key] = v

    print(f"[INFO] StatCan wage_index points loaded: {len(per_date)}")
    return per_date


def fetch_statcan_unemployment_rate() -> Dict[str, float]:
    """
    Fetch Canada unemployment rate (both sexes, 15 years and over,
    monthly, seasonally adjusted) from StatCan table 14-10-0287-01.

    We use vector v2062815.
    Returns:
        { "YYYY-MM-01": unemployment_rate_percent }
    """
    base_url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"

    payload = [{"vectorId": 2062815, "latestN": 2000}]
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
        print(f"[WARN] StatCan unemployment fetch failed: {e}")
        return {}

    per_date: Dict[str, float] = {}

    if not isinstance(res, list) or not res:
        print("[WARN] StatCan unemployment response not a non-empty list")
        return {}

    entry = res[0]
    if entry.get("status") != "SUCCESS":
        print(f"[WARN] StatCan unemployment status: {entry.get('status')}")
        return {}

    obj = entry.get("object") or {}
    points = obj.get("vectorDataPoint", [])

    for dp in points:
        value = dp.get("value")
        symbol = dp.get("symbolCode")

        if value in (None, "", "NaN"):
            continue
        if symbol not in (0, None, "", "E"):
            continue

        try:
            v = float(value)
        except (TypeError, ValueError):
            continue

        ref = dp.get("refPer") or dp.get("refPerRaw")
        if not ref:
            continue

        if len(ref) == 7:
            ref = ref + "-01"
        try:
            d = datetime.fromisoformat(ref[:10]).date()
        except Exception:
            continue

        key = date(d.year, d.month, 1).isoformat()
        per_date[key] = v

    return per_date


def generate_inflation() -> List[PanelRow]:
    """
    Build inflation & labour series using real Statistics Canada data:
      - cpi_headline       (CPI all-items index)
      - cpi_shelter        (Owned accommodation CPI)
      - cpi_rent           (Rent CPI)
      - wage_index         (average weekly earnings, 14-10-0222-01)
      - unemployment_rate  (LFS unemployment rate, 14-10-0287-01)

    If a StatCan fetch fails, we simply omit that series (no synthetic fallback).
    """
    rows: List[PanelRow] = []
    region = "canada"

    cpi_series = fetch_statcan_cpi()
    wage_index = fetch_statcan_wage_index()
    unemployment = fetch_statcan_unemployment_rate()

    # CPI indices (2002=100)
    for metric in ("cpi_headline", "cpi_shelter", "cpi_rent"):
        per_date = cpi_series.get(metric, {})
        if not per_date:
            continue
        dates = sorted(per_date.keys())
        values = [per_date[d] for d in dates]
        mom, yoy, ma3 = compute_changes(values)

        for dt_str, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt_str,
                    region=region,
                    segment="all",
                    metric=metric,
                    value=round(val, 3),
                    unit="index",
                    source="statcan_cpi_18-10-0004-01",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

    # Wage index – average weekly earnings (CAD per week)
    if wage_index:
        dates = sorted(wage_index.keys())
        values = [wage_index[d] for d in dates]
        mom, yoy, ma3 = compute_changes(values)

        for dt_str, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt_str,
                    region=region,
                    segment="all",
                    metric="wage_index",
                    value=round(val, 3),
                    unit="cad_per_week",
                    source="statcan_14-10-0222-01",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )
    else:
        print(
            "[WARN] StatCan wage index unavailable – "
            "no wage_index rows will be generated"
        )

    # Unemployment rate – %
    if unemployment:
        dates = sorted(unemployment.keys())
        values = [unemployment[d] for d in dates]
        mom, yoy, ma3 = compute_changes(values)

        for dt_str, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt_str,
                    region=region,
                    segment="all",
                    metric="unemployment_rate",
                    value=round(val, 3),
                    unit="pct",
                    source="statcan_14-10-0287-01",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )
    else:
        print(
            "[WARN] StatCan unemployment rate unavailable – "
            "no unemployment_rate rows will be generated"
        )

    print(f"[INFO] Generated {len(rows)} inflation/labour rows from StatCan")
    return rows


# ---------------------------------------------------------------------------
# IO + entry point
# ---------------------------------------------------------------------------

def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    inflation = generate_inflation()
    out_path = DATA_DIR / "inflation_labour.json"
    write_json(out_path, inflation)
    print(f"Wrote {len(inflation)} inflation/labour rows to {out_path}")


if __name__ == "__main__":
    main()

