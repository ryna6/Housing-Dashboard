"""
Generate synthetic test data for the housing dashboard.

This script overwrites the following files under data/processed/:

  - panel.json
  - prices.json
  - sales_listings.json
  - rentals.json
  - rates_bonds.json
  - inflation_labour.json

Run from the repo root:

  python scripts/generate_test_data.py
"""

from __future__ import annotations

import json
import math
import csv
import io
import zipfile
import urllib.request
from urllib.error import HTTPError, URLError
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"


REGION_OFFSETS: Dict[str, float] = {
    "canada": 0.0,
    "on": 5.0,
    "bc": 7.0,
    "gta": 8.0,
    "hamilton": 6.0,
    "halton": 6.5,
    "niagara": 5.5,
    "vancouver": 9.0,
    "burnaby": 8.5,
    "surrey": 7.5,
    "richmond": 8.8,
    "victoria": 7.8,
}


@dataclass
class PanelRow:
    date: str          # YYYY-MM-01
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_months(start_year: int = 2023, start_month: int = 1, periods: int = 18) -> List[date]:
    y, m = start_year, start_month
    out: List[date] = []
    for _ in range(periods):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


MONTHS = generate_months()

# rates test 
def fetch_boc_series_monthly(
    series_ids: List[str],
    start: str = "2000-01-01",
    end: Optional[str] = None,
) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more Bank of Canada Valet series and aggregate to monthly levels.

    We use one HTTP call *per series* using the documented pattern:
      https://www.bankofcanada.ca/valet/observations/{seriesId}/json?start_date=...

    For each calendar month we keep the **last available daily observation**
    (rather than an average). This matches how policy-rate decisions work and
    avoids fractional values like 4.73% when the target actually moves in 0.25
    percentage-point steps.

    Returns a dict:
        {
          "YYYY-MM-01": { "V39079": 4.75, "V122538": 3.10, ... },
          ...
        }

    Any HTTP/connection errors are logged but do NOT raise, so builds don't fail.
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
            # Don't kill the build if BoC is down or series is missing
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

            # Rely on Valet returning observations in chronological order;
            # the last assignment in a month will be the last daily value.
            monthly_last[month_key][sid] = v

    monthly: Dict[str, Dict[str, float]] = {}
    for month_key, per_sid in monthly_last.items():
        monthly[month_key] = dict(per_sid)

    return monthly

def generate_rates() -> List[PanelRow]:
    """
    Wrapper used by main(): generate rate data from the real
    Bank of Canada Valet API.

    If anything fails or BoC is unavailable, we return an empty list so
    the frontend simply shows "Not available for this selection" instead
    of silently filling synthetic values.
    """
    try:
        rows = generate_rates_from_boc()
        print(f"[INFO] Loaded {len(rows)} rate rows from BoC Valet")
        return rows
    except Exception as e:
        print(f"[ERROR] generate_rates_from_boc failed: {e!r}")
        return []


# generating real rates
def generate_rates_from_boc() -> List[PanelRow]:
    """
    Generate rates data using *real* Bank of Canada series via the Valet API.

    Metrics → BoC series:
      - policy_rate      -> V39079   (Target for the overnight rate, %)
      - gov_2y_yield     -> V122538  (2-year GoC benchmark bond yield, %)
      - gov_5y_yield     -> V122540  (5-year GoC benchmark bond yield, %)
      - gov_10y_yield    -> V122487  (Long-term GoC bond yield >10y, %)
      - mortgage_5y      -> V80691311  (Prime rate, %)
    """
    rows: List[PanelRow] = []
    region = "canada"

    series_by_metric: Dict[str, Tuple[str, str]] = {
        "policy_rate": ("V39079", "pct"),
        "gov_2y_yield": ("V122538", "pct"),
        "gov_5y_yield": ("V122540", "pct"),
        "gov_10y_yield": ("V122487", "pct"),
        "mortgage_5y": ("V80691311", "pct"),
    }

    all_series_ids = [cfg[0] for cfg in series_by_metric.values()]

    monthly = fetch_boc_series_monthly(all_series_ids, start="2000-01-01")
    if not monthly:
        # Let caller decide whether to fall back
        return []

    for metric, (series_id, unit) in series_by_metric.items():
        month_keys = sorted(
            d
            for d, per_sid in monthly.items()
            if series_id in per_sid and per_sid[series_id] is not None
        )
        if not month_keys:
            continue

        vals: List[float] = [monthly[d][series_id] for d in month_keys]
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

    # Derive mortgage_5y_spread where both mortgage_5y and gov_5y_yield are available
    mort_by_date = {r.date: r for r in rows if r.metric == "mortgage_5y"}
    g5_by_date = {r.date: r for r in rows if r.metric == "gov_5y_yield"}

    common_dates = sorted(set(mort_by_date.keys()) & set(g5_by_date.keys()))
    if common_dates:
        spread_vals: List[float] = [
            mort_by_date[d].value - g5_by_date[d].value for d in common_dates
        ]
        mom, yoy, ma3 = compute_changes(spread_vals)

        for dt_str, val, m, y, ma in zip(common_dates, spread_vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt_str,
                    region=region,
                    segment="all",
                    metric="mortgage_5y_spread",
                    value=round(val, 3),
                    unit="pct",
                    source="boc_valet_derived",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

    return rows

# end of rates test



def compute_changes(values: List[float]) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
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


def generate_prices() -> List[PanelRow]:
    rows: List[PanelRow] = []

    for region, offset in REGION_OFFSETS.items():
        # HPI benchmark
        base = 250.0 + offset
        vals: List[float] = []
        for i, dt in enumerate(MONTHS):
            vals.append(base + i * 1.5)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="hpi_benchmark",
                    value=round(val, 2),
                    unit="index",
                    source="test_prices",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Average price
        base = 700_000.0 + offset * 10_000.0
        vals = []
        for i, dt in enumerate(MONTHS):
            vals.append(base + i * 7_500.0)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="avg_price",
                    value=round(val, 2),
                    unit="cad",
                    source="test_prices",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Teranet HPI
        base = 220.0 + offset
        vals = []
        for i, dt in enumerate(MONTHS):
            vals.append(base + i * 1.2)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="teranet_hpi",
                    value=round(val, 2),
                    unit="index",
                    source="test_prices",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

    return rows


def generate_sales() -> List[PanelRow]:
    rows: List[PanelRow] = []

    for region, offset in REGION_OFFSETS.items():
        # Sales
        base = 2_000.0 + offset * 50.0
        vals: List[float] = []
        for i, dt in enumerate(MONTHS):
            seasonal = 200.0 * math.sin(2.0 * math.pi * (i % 12) / 12.0)
            vals.append(base + i * 20.0 + seasonal)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="sales",
                    value=round(val, 2),
                    unit="count",
                    source="test_sales",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # New listings
        base = 3_000.0 + offset * 60.0
        vals = []
        for i, dt in enumerate(MONTHS):
            seasonal = 300.0 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.3)
            vals.append(base + i * 25.0 + seasonal)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="new_listings",
                    value=round(val, 2),
                    unit="count",
                    source="test_sales",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Active listings
        base = 6_000.0 + offset * 70.0
        vals = []
        for i, dt in enumerate(MONTHS):
            seasonal = 400.0 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.6)
            vals.append(base + i * 15.0 + seasonal)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="active_listings",
                    value=round(val, 2),
                    unit="count",
                    source="test_sales",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Derived SNLR & MOI (we'll fill changes after)
        sales_by_date = {
            r.date: r
            for r in rows
            if r.region == region and r.metric == "sales"
        }
        new_by_date = {
            r.date: r
            for r in rows
            if r.region == region and r.metric == "new_listings"
        }
        active_by_date = {
            r.date: r
            for r in rows
            if r.region == region and r.metric == "active_listings"
        }

        for dt in MONTHS:
            ds = dt.isoformat()
            sales_val = sales_by_date[ds].value
            new_val = new_by_date[ds].value
            active_val = active_by_date[ds].value

            snlr = sales_val / new_val if new_val else 0.0
            moi = active_val / sales_val if sales_val else 0.0

            rows.append(
                PanelRow(
                    date=ds,
                    region=region,
                    segment="all",
                    metric="snlr",
                    value=round(snlr, 4),
                    unit="ratio",
                    source="test_sales",
                    mom_pct=None,
                    yoy_pct=None,
                    ma3=None,
                )
            )
            rows.append(
                PanelRow(
                    date=ds,
                    region=region,
                    segment="all",
                    metric="moi",
                    value=round(moi, 4),
                    unit="ratio",
                    source="test_sales",
                    mom_pct=None,
                    yoy_pct=None,
                    ma3=None,
                )
            )

    # Now compute changes for SNLR/MOI
    grouped: Dict[Tuple[str, str], List[PanelRow]] = defaultdict(list)
    for r in rows:
        if r.metric in {"snlr", "moi"}:
            grouped[(r.region, r.metric)].append(r)

    for (_, _), series in grouped.items():
        series.sort(key=lambda r: r.date)
        vals = [r.value for r in series]
        mom, yoy, ma3 = compute_changes(vals)
        for r, m, y, ma in zip(series, mom, yoy, ma3):
            r.mom_pct = round(m, 3) if m is not None else None
            r.yoy_pct = round(y, 3) if y is not None else None
            r.ma3 = round(ma, 3)

    return rows


def generate_rentals() -> List[PanelRow]:
    rows: List[PanelRow] = []

    for region, offset in REGION_OFFSETS.items():
        # Average rent
        base = 2_000.0 + offset * 20.0
        vals: List[float] = []
        for i, dt in enumerate(MONTHS):
            seasonal = 50.0 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.3)
            vals.append(base + i * 25.0 + seasonal)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="avg_rent",
                    value=round(val, 2),
                    unit="cad",
                    source="test_rentals",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Vacancy rate
        base = 2.0 + offset * 0.05
        vals = []
        for i, dt in enumerate(MONTHS):
            seasonal = 0.5 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 1.0)
            vals.append(base + math.sin(i / 6.0) * 0.1 + seasonal)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="vacancy_rate",
                    value=round(val, 3),
                    unit="pct",
                    source="test_rentals",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Rent index (rebased)
        base = 100.0 + offset * 0.5
        vals = []
        for i, dt in enumerate(MONTHS):
            vals.append(base + i * 0.8)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="rent_index",
                    value=round(val, 3),
                    unit="index",
                    source="test_rentals",
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

        # Rent inflation (YoY of rent_index)
        mom, yoy, ma3 = compute_changes(vals)
        for dt, _, _, y, _ in zip(MONTHS, vals, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt.isoformat(),
                    region=region,
                    segment="all",
                    metric="rent_inflation",
                    value=round(y or 0.0, 3) if y is not None else 0.0,
                    unit="pct",
                    source="test_rentals",
                    mom_pct=None,
                    yoy_pct=None,
                    ma3=None,
                )
            )

    return rows

# --- StatCan CPI (real data) -----------------------------------------------

def fetch_statcan_cpi() -> Dict[str, Dict[str, float]]:
    """
    Fetch CPI index series for Canada from Statistics Canada Web Data Service.

    We use the following vectors (all from table 18-10-0004-01, 2002=100):
      - cpi_headline: v41690973  (All-items)
      - cpi_shelter:  v41691055  (Owned accomodation)
      - cpi_rent:     v41691052  (Rent)
    """
    base_url = (
        "https://www150.statcan.gc.ca/"
        "t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
    )

    # metric -> numeric vectorId (drop the leading 'v')
    vector_ids: Dict[str, int] = {
        "cpi_headline": 41690973,
        "cpi_shelter": 41691055,
        "cpi_rent": 41691052,
    }

    # WDS expects a JSON *array* of requests
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
        # Don't break the build if StatCan is down
        print(f"[WARN] StatCan CPI fetch failed: {e}")
        return {}

    # metric -> date -> value
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

            # Skip missing / suppressed points
            if value in (None, "", "NaN"):
                continue
            if symbol not in (0, None):
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            # Monthly CPI uses the first of month, e.g. "2025-10-01"
            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue
            try:
                dt = datetime.fromisoformat(ref)
                key = dt.date().isoformat()
            except Exception:
                key = ref

            series[metric][key] = v

    return series

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


def fetch_statcan_vectors(
    vector_ids: Dict[str, int],
    latest_n: int = 600,
) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more Statistics Canada WDS vectors and return
    monthly series { metric: { 'YYYY-MM-01': value, ... } }.

    Uses getDataFromVectorsAndLatestNPeriods:
      POST https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods
      BODY: [{"vectorId": 41690973, "latestN": 600}, ...]
    """
    url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"

    payload = [
        {"vectorId": vid, "latestN": latest_n} for vid in vector_ids.values()
    ]

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = json.load(resp)
    except (HTTPError, URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] StatCan WDS fetch failed: {e}")
        # Return empty dicts for each metric so callers don't crash
        return {metric: {} for metric in vector_ids.keys()}

    series_by_metric: Dict[str, Dict[str, float]] = {
        metric: {} for metric in vector_ids.keys()
    }

    for metric, obj in zip(vector_ids.keys(), raw):
        status = obj.get("status")
        if status != "SUCCESS":
            print(f"[WARN] StatCan WDS status for {metric}: {status}")
            continue

        points = obj.get("object", {}).get("vectorDataPoint", [])
        for pt in points:
            ref = pt.get("refPer")
            val_str = pt.get("value")

            if not ref or val_str in (None, "", "..."):
                continue

            # refPer is usually "YYYY-MM-01" or "YYYY-MM"
            if len(ref) == 7:
                ref += "-01"

            try:
                d = datetime.fromisoformat(ref[:10]).date()
            except Exception:
                continue

            try:
                val = float(val_str)
            except ValueError:
                continue

            key = date(d.year, d.month, 1).isoformat()
            series_by_metric[metric][key] = val

    return series_by_metric


def generate_inflation() -> List[PanelRow]:
    rows: List[PanelRow] = []
    region = "canada"

    # 1) CPI (headline, shelter, rent) – StatCan CPI index (18-10-0004-01)
    cpi_series = fetch_statcan_cpi()

    if cpi_series:
        for metric, per_date in cpi_series.items():
            # per_date: { "YYYY-MM-01": index_value }
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
                        source="statcan_cpi",
                        mom_pct=round(m, 3) if m is not None else None,
                        yoy_pct=round(y, 3) if y is not None else None,
                        ma3=round(ma, 3),
                    )
                )
    else:
        # No synthetic fallback: just log and let the UI say "No data"
        print(
            "[WARN] StatCan CPI unavailable – "
            "no CPI rows will be generated for inflation_labour.json"
        )

    # 2) Wage index – average weekly earnings (14-10-0222-01)
    wage_index = fetch_statcan_wage_index()
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
                    # Actual dollars per week; we treat as a generic index
                    # so cards show raw numbers and the chart uses a real
                    # level series instead of YoY %.
                    value=round(val, 3),
                    unit="index",
                    source="statcan_seph",
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

    # 3) Unemployment rate – LFS (14-10-0287-01)
    unemployment = fetch_statcan_unemployment_rate()
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
                    source="statcan_lfs",
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

    return rows

def fetch_statcan_wage_index() -> Dict[str, float]:
    """
    Wage index from StatCan table 14-10-0222-01:
    'Employment, average hourly and weekly earnings (including overtime),
     and average weekly hours for the industrial aggregate excluding
     unclassified businesses, monthly, seasonally adjusted'.

    We use average weekly earnings including overtime for all employees,
    Canada, industrial aggregate excl. unclassified businesses.
    """
    meta_url = f"{WDS_BASE}/getFullTableDownloadCSV/14100222/en"

    try:
        with urllib.request.urlopen(meta_url, timeout=30) as resp:
            meta = json.load(resp)
    except (HTTPError, URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] StatCan wage meta fetch failed: {e}")
        return {}

    if meta.get("status") != "SUCCESS":
        print(f"[WARN] StatCan wage meta status: {meta.get('status')}")
        return {}

    csv_url = meta.get("object")
    if not csv_url:
        print("[WARN] StatCan wage meta missing 'object' URL")
        return {}

    try:
        with urllib.request.urlopen(csv_url, timeout=60) as resp:
            zip_bytes = resp.read()
    except (HTTPError, URLError, TimeoutError) as e:
        print(f"[WARN] StatCan wage CSV download failed: {e}")
        return {}

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            csv_name = next(
                (n for n in zf.namelist() if n.lower().endswith(".csv")),
                None,
            )
            if not csv_name:
                print("[WARN] StatCan wage ZIP has no CSV file")
                return {}
            csv_data = zf.read(csv_name).decode("utf-8-sig")
    except Exception as e:
        print(f"[WARN] StatCan wage ZIP parse failed: {e}")
        return {}

    out: Dict[str, float] = {}
    reader = csv.DictReader(io.StringIO(csv_data))

    for row in reader:
        geo = (row.get("GEO") or "").strip()
        stat = (row.get("Statistics") or "").strip()
        naics = (
            row.get("North American Industry Classification System (NAICS)") or ""
        ).strip()
        val_str = row.get("VALUE")
        ref = row.get("REF_DATE")

        # We only care about national, industrial aggregate, average weekly earnings
        if "Canada" not in geo:
            continue
        if "Industrial aggregate excluding unclassified businesses" not in naics:
            continue
        if "Average weekly earnings" not in stat or "all employees" not in stat:
            continue
        if not ref or val_str in (None, "", "..."):
            continue

        # REF_DATE is "YYYY-MM"
        try:
            if len(ref) == 7:
                d = datetime.strptime(ref + "-01", "%Y-%m-%d").date()
            else:
                d = datetime.strptime(ref, "%Y-%m-%d").date()
        except Exception:
            continue

        try:
            val = float(val_str)
        except ValueError:
            continue

        key = date(d.year, d.month, 1).isoformat()
        out[key] = val

    return out


def fetch_statcan_unemployment_rate() -> Dict[str, float]:
    """
    Fetch Canada unemployment rate (both sexes, 15 years and over,
    monthly, seasonally adjusted) from StatCan table 14-10-0287-01
    (formerly CANSIM 282-0087).

    We use vector v2062815. 

    Returns:
        { "YYYY-MM-01": unemployment_rate_percent }
    """
    base_url = (
        "https://www150.statcan.gc.ca/"
        "t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
    )

    # v2062815 -> unemployment rate, Canada, SA, both sexes 15+
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

    if not isinstance(res, list):
        print("[WARN] StatCan unemployment response not a list")
        return {}

    for entry in res:
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}

        for dp in obj.get("vectorDataPoint", []):
            value = dp.get("value")
            symbol = dp.get("symbolCode")

            if value in (None, "", "NaN"):
                continue
            if symbol and symbol not in ("", "E"):  # ignore suppressed
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue

            # Normalise to YYYY-MM-01
            try:
                dt = datetime.fromisoformat(ref)
                key = dt.date().isoformat()
            except Exception:
                if len(ref) == 7 and ref[4] == "-":  # "YYYY-MM"
                    key = ref + "-01"
                else:
                    key = ref

            per_date[key] = v

    return per_date
  


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    prices = generate_prices()
    sales = generate_sales()
    rentals = generate_rentals()
    rates = generate_rates()
    inflation = generate_inflation()

    # panel.json = all rows together
    panel = prices + sales + rentals + rates + inflation

    write_json(DATA_DIR / "panel.json", panel)
    write_json(DATA_DIR / "prices.json", prices)
    write_json(DATA_DIR / "sales_listings.json", sales)
    write_json(DATA_DIR / "rentals.json", rentals)
    write_json(DATA_DIR / "rates_bonds.json", rates)
    write_json(DATA_DIR / "inflation_labour.json", inflation)

    print(f"Wrote synthetic data to {DATA_DIR}")


if __name__ == "__main__":
    main()
