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
import urllib.request
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
    Fetch one or more Bank of Canada Valet series and aggregate to monthly averages.

    Returns a dict:
        {
          "YYYY-MM-01": { "V39079": 4.75, "V122538": 3.10, ... },
          ...
        }
    """
    base = "https://www.bankofcanada.ca/valet/observations"
    sid_str = ",".join(series_ids)
    params = f"?start_date={start}"
    if end:
        params += f"&end_date={end}"
    url = f"{base}/{sid_str}/json{params}"

    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.load(resp)

    observations = payload.get("observations", [])

    # month_key -> series_id -> list of daily values to average
    monthly: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

    for o in observations:
        d_str = o.get("d")
        if not d_str:
            continue

        # Dates are usually ISO like "2025-10-31"
        try:
            d = datetime.fromisoformat(d_str).date()
        except Exception:
            try:
                d = datetime.strptime(d_str[:10], "%Y-%m-%d").date()
            except Exception:
                continue

        month_key = date(d.year, d.month, 1).isoformat()

        for sid in series_ids:
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
            monthly[month_key][sid].append(v)

    result: Dict[str, Dict[str, float]] = {}
    for month_key, per_sid in monthly.items():
        result[month_key] = {}
        for sid, values in per_sid.items():
            if not values:
                continue
            result[month_key][sid] = sum(values) / len(values)

    return result

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

# rates test
def generate_rates() -> List[PanelRow]:
    """
    Generate rates data using *real* Bank of Canada series via the Valet API.

    Metrics → BoC CANSIM series:
      - policy_rate      -> V39079   (Target for the overnight rate, %)
      - gov_2y_yield     -> V122538  (2-year GoC benchmark bond yield, %)
      - gov_5y_yield     -> V122540  (5-year GoC benchmark bond yield, %)
      - gov_10y_yield    -> V122487  (Long-term GoC bond yield >10y, %)
      - mortgage_5y      -> V122521  (5-year conventional mortgage rate, %, discontinued after 2019-10)

    We also derive:
      - mortgage_5y_spread = mortgage_5y - gov_5y_yield
    """
    rows: List[PanelRow] = []
    region = "canada"

    # Map our internal metric IDs to BoC series IDs and units
    series_by_metric: Dict[str, Tuple[str, str]] = {
        "policy_rate": ("V39079", "pct"),
        "gov_2y_yield": ("V122538", "pct"),
        "gov_5y_yield": ("V122540", "pct"),
        "gov_10y_yield": ("V122487", "pct"),
        "mortgage_5y": ("V122521", "pct"),
    }

    all_series_ids = [cfg[0] for cfg in series_by_metric.values()]

    # Fetch month-averaged series from 2000 onward
    monthly = fetch_boc_series_monthly(all_series_ids, start="2000-01-01")

    # Build rows for the core rate metrics
    for metric, (series_id, unit) in series_by_metric.items():
        # Get all months where we have a value for this series
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

# end rates test


def generate_inflation() -> List[PanelRow]:
    rows: List[PanelRow] = []
    region = "canada"

    # Headline CPI
    base = 150.0
    vals: List[float] = []
    for i, dt in enumerate(MONTHS):
        seasonal = 0.3 * math.sin(2.0 * math.pi * (i % 12) / 12.0)
        vals.append(base + i * 0.6 + seasonal)
    mom, yoy, ma3 = compute_changes(vals)
    for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt.isoformat(),
                region=region,
                segment="all",
                metric="cpi_headline",
                value=round(val, 3),
                unit="index",
                source="test_inflation",
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )

    # Shelter CPI
    base = 160.0
    vals = []
    for i, dt in enumerate(MONTHS):
        seasonal = 0.4 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.5)
        vals.append(base + i * 0.7 + seasonal)
    mom, yoy, ma3 = compute_changes(vals)
    for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt.isoformat(),
                region=region,
                segment="all",
                metric="cpi_shelter",
                value=round(val, 3),
                unit="index",
                source="test_inflation",
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )

    # Rent CPI
    base = 155.0
    vals = []
    for i, dt in enumerate(MONTHS):
        seasonal = 0.5 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.8)
        vals.append(base + i * 0.65 + seasonal)
    mom, yoy, ma3 = compute_changes(vals)
    for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt.isoformat(),
                region=region,
                segment="all",
                metric="cpi_rent",
                value=round(val, 3),
                unit="index",
                source="test_inflation",
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )

    # Wage index
    base = 140.0
    vals = []
    for i, dt in enumerate(MONTHS):
        seasonal = 0.7 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 0.2)
        vals.append(base + i * 0.8 + seasonal)
    mom, yoy, ma3 = compute_changes(vals)
    for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt.isoformat(),
                region=region,
                segment="all",
                metric="wage_index",
                value=round(val, 3),
                unit="index",
                source="test_inflation",
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )

    # Unemployment rate
    base = 6.0
    vals = []
    for i, dt in enumerate(MONTHS):
        seasonal = 0.3 * math.sin(2.0 * math.pi * (i % 12) / 12.0 + 1.0)
        vals.append(base + math.sin(i / 5.0) * 0.2 + seasonal)
    mom, yoy, ma3 = compute_changes(vals)
    for dt, val, m, y, ma in zip(MONTHS, vals, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt.isoformat(),
                region=region,
                segment="all",
                metric="unemployment_rate",
                value=round(val, 3),
                unit="pct",
                source="test_inflation",
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3),
            )
        )

    return rows


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
