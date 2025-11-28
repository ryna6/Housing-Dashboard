from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"


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


def generate_prices() -> List[PanelRow]:
    """
    Generate price / HPI series for the dashboard using the CREA MLS HPI
    Excel workbook located under data/raw.

    Outputs three metrics:
      - hpi_benchmark: composite HPI index (segment = "composite")
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
# IO + entry point
# ---------------------------------------------------------------------------

def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    prices = generate_prices()
    write_json(DATA_DIR / "prices.json", prices)
    print(f"Wrote {len(prices)} price rows to {DATA_DIR / 'prices.json'}")


if __name__ == "__main__":
    main()
