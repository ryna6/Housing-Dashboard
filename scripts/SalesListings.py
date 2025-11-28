from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional, Tuple

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"


@dataclass
class PanelRow:
    date: str          # YYYY-MM-01 (first of month)
    region: str        # always "canada"
    segment: str       # always "all" (no housing-type breakdown on this tab)
    metric: str        # "new_listings" | "active_listings" | "snlr" | "moi" | "absorption_rate"
    value: float
    unit: str          # "count" | "pct" | "months"
    source: str        # "crea" | "statcan_34-10-0149-01"
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def compute_changes(
    values: List[float],
) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
    """
    Compute MoM %, YoY %, and 3-month moving average for a level series.

    Identical logic to Prices.py / InflationLabour.py so that all tabs share
    the same definition of month-over-month and year-over-year changes.
    """
    n = len(values)
    mom: List[Optional[float]] = [None] * n
    yoy: List[Optional[float]] = [None] * n
    ma3: List[float] = [0.0] * n

    for i, v in enumerate(values):
        # Simple trailing 3-month moving average on the level series
        window = values[max(0, i - 2) : i + 1]
        ma3[i] = sum(window) / len(window)

        # MoM %
        if i > 0 and values[i - 1] != 0:
            mom[i] = (v / values[i - 1] - 1.0) * 100.0

        # YoY %
        if i >= 12 and values[i - 12] != 0:
            yoy[i] = (v / values[i - 12] - 1.0) * 100.0

    return mom, yoy, ma3


def generate_sales() -> List[PanelRow]:
    """
    Placeholder generator for the Sales tab.

    For this first step we only need the *shape* of the JSON so that the
    front-end layout (cards + charts) can be wired up. We deliberately
    return an empty list here – no CREA or StatCan data is read yet.

    In the next iteration we will:
      - load CREA quarterly sales & new-listings (SA Sales & Listings Canada.xlsx)
      - load monthly MOI & SNLR
      - fetch StatCan absorption / unabsorbed inventory
      - derive active_listings and absorption_rate
    and then populate real PanelRow instances.
    """
    return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_sales()
    out_path = DATA_DIR / "sales_listings.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} sales rows to {out_path}")


if __name__ == "__main__":
    main()
