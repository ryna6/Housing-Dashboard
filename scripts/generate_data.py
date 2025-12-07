from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, List

from Overview import generate_overview
from Prices import generate_prices
from Sales import generate_sales
from Rentals import generate_rentals
from Rates import generate_rates
from Inflation import generate_inflation
from Credit import generate_credit
from Market import generate_market
from Supply import generate_supply


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"


def write_json(path: Path, rows: List[Any]) -> None:
    """
    Write a panel (list of rows) to JSON.

    Supports both:
      - dataclass instances (uses asdict)
      - plain dicts (passed through unchanged)
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    data = [
        asdict(r) if is_dataclass(r) else r
        for r in rows
    ]

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def main() -> None:
    """
    Run all tab generators, concatenate into a single panel, and write panel.json.
    Each generator is expected to return a list of dataclass instances (PanelRow)
    or JSON-ready dicts.
    """
    # Individual tab panels
    overview = generate_overview()
    prices = generate_prices()
    sales = generate_sales()
    rentals = generate_rentals()
    rates = generate_rates()
    inflation = generate_inflation()
    credit = generate_credit()
    market = generate_market()
    supply = generate_supply()

    # Concatenate all rows into one big panel
    panel = (
        overview
        + prices
        + sales
        + rentals
        + rates
        + inflation
        + credit
        + market
        + supply
    )

    # Write combined panel
    write_json(DATA_DIR / "panel.json", panel)
    print(f"[generate_data] Wrote combined panel with {len(panel)} rows → {DATA_DIR / 'panel.json'}")


if __name__ == "__main__":
    main()
