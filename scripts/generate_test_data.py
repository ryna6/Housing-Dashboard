"""
Generate data for the housing dashboard.

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
import urllib.request
from urllib.error import HTTPError, URLError
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

REGION_OFFSETS: Dict[str, float] = {
    "canada": 0.0,
    "on": 5.0,
    "bc": 7.0,
    "gta": 8.0,
    "hamilton": 6.0,
    "halton": 6.5,
    "niagara": 5.5,
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


def compute_changes(values: List[float]) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
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
        window = values[max(0, i - 2): i + 1]
        ma3[i] = sum(window) / len(window)

        if i > 0 and values[i - 1] != 0:
            mom[i] = (v / values[i - 1] - 1.0) * 100.0

        if i >= 12 and values[i - 12] != 0:
            yoy[i] = (v / values[i - 12] - 1.0) * 100.0

    return mom, yoy, ma3

# ---------------------------------------------------------------------------
# Prices – MLS HPI (from CREA Excel)
# ---------------------------------------------------------------------------

def generate_prices() -> List[PanelRow]:
    """
    Generate price / HPI series for the dashboard using the CREA MLS HPI
    Excel workbook located under data/raw.

    Outputs three metrics:
      - hpi_benchmark: composite HPI index (segment="composite")
      - hpi_type: HPI index by housing type (segment varies)
      - avg_price: benchmark price by housing type (segment varies)
    """
    rows: List[PanelRow] = []

    # Map dashboard region codes to Excel sheet names
    region_sheets: Dict[str, str] = {
        "canada": "AGGREGATE",
        "greater_vancouver": "GREATER_VANCOUVER",
        "lower_mainland": "LOWER_MAINLAND",
        "calgary": "CALGARY",
        "greater_toronto": "GREATER_TORONTO",
        "montreal": "MONTREAL_CMA",
    }

    # Map housing-type codes to HPI / benchmark column names
    housing_type_cols: Dict[str, Tuple[str, str]] = {
        "composite": ("Composite_HPI_SA", "Composite_Benchmark_SA"),
        "one_storey": ("One_Storey_HPI_SA", "One_Storey_Benchmark_SA"),
        "two_storey": ("Two_Storey_HPI_SA", "Two_Storey_Benchmark_SA"),
        "townhouse": ("Townhouse_HPI_SA", "Townhouse_Benchmark_SA"),
        "apartment": ("Apartment_HPI_SA", "Apartment_Benchmark_SA"),
    }

    mls_path = RAW_DATA_DIR / "SA MLS HPI & Avg Price Canada.xlsx"
    if not mls_path.exists():
        raise FileNotFoundError(f"Missing MLS HPI workbook at {mls_path}")

    xls = pd.ExcelFile(mls_path)

    for region_code, sheet_name in region_sheets.items():
        if sheet_name not in xls.sheet_names:
            continue

        df = pd.read_excel(xls, sheet_name)
        if "Date" not in df.columns:
            continue

        # Ensure we have a clean Date column
        df = df.copy()
        df["Date"] = pd.to_datetime(df["Date"]).dt.date
        df = df.sort_values("Date")

        dates = [d.isoformat() for d in df["Date"]]

        # Benchmark HPI (composite index only)
        if "Composite_HPI_SA" in df.columns:
            vals = df["Composite_HPI_SA"].astype(float).tolist()
            mom, yoy, ma3 = compute_changes(vals)
            for dt, val, m, y, ma in zip(dates, vals, mom, yoy, ma3):
                rows.append(
                    PanelRow(
                        date=dt,
                        region=region_code,
                        segment="composite",
                        metric="hpi_benchmark",
                        value=round(val, 2),
                        unit="index",
                        source="mls_hpi",
                        mom_pct=round(m, 3) if m is not None else None,
                        yoy_pct=round(y, 3) if y is not None else None,
                        ma3=round(ma, 3),
                    )
                )

        # Housing-type HPI + benchmark prices
        for segment, (hpi_col, price_col) in housing_type_cols.items():
            if hpi_col not in df.columns or price_col not in df.columns:
                continue

            # HPI by housing type
            hpi_vals = df[hpi_col].astype(float).tolist()
            mom, yoy, ma3 = compute_changes(hpi_vals)
            for dt, val, m, y, ma in zip(dates, hpi_vals, mom, yoy, ma3):
                rows.append(
                    PanelRow(
                        date=dt,
                        region=region_code,
                        segment=segment,
                        metric="hpi_type",
                        value=round(val, 2),
                        unit="index",
                        source="mls_hpi",
                        mom_pct=round(m, 3) if m is not None else None,
                        yoy_pct=round(y, 3) if y is not None else None,
                        ma3=round(ma, 3),
                    )
                )

            # Benchmark (average) price by housing type
            price_vals = df[price_col].astype(float).tolist()
            mom, yoy, ma3 = compute_changes(price_vals)
            for dt, val, m, y, ma in zip(dates, price_vals, mom, yoy, ma3):
                rows.append(
                    PanelRow(
                        date=dt,
                        region=region_code,
                        segment=segment,
                        metric="avg_price",
                        value=round(val, 2),
                        unit="cad",
                        source="mls_hpi",
                        mom_pct=round(m, 3) if m is not None else None,
                        yoy_pct=round(y, 3) if y is not None else None,
                        ma3=round(ma, 3),
                    )
                )

    return rows

# ---------------------------------------------------------------------------
# Sales – synthetic
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Rentals – synthetic
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Rates – real BoC Valet
# ---------------------------------------------------------------------------

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
      - gov_5y_yield     -> V122540   (5-year GoC benchmark bond yield, %)
      - gov_10y_yield    -> V122487   (Long-term GoC bond yield >10y, %)
      - mortgage_5y      -> V80691311 (Prime rate, %)
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

    prices = generate_prices()
    sales = generate_sales()
    rentals = generate_rentals()
    rates = generate_rates()
    inflation = generate_inflation()

    panel = prices + sales + rentals + rates + inflation

    write_json(DATA_DIR / "panel.json", panel)
    write_json(DATA_DIR / "prices.json", prices)
    write_json(DATA_DIR / "sales_listings.json", sales)
    write_json(DATA_DIR / "rentals.json", rentals)
    write_json(DATA_DIR / "rates_bonds.json", rates)
    write_json(DATA_DIR / "inflation_labour.json", inflation)

    print(f"Wrote dashboard data to {DATA_DIR}")


if __name__ == "__main__":
    main()
