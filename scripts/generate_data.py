from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, List

# Import the tab-specific generators
from Prices import generate_prices
from SalesListings import generate_sales
from Rentals import generate_rentals
from RatesBonds import generate_rates
from InflationLabour import generate_inflation
from Credit import generate_credit
from Market import generate_risk
from Supply import generate_supply


# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"


def write_json(path: Path, rows: List[Any]) -> None:
    """
    Write a list of dataclass rows to JSON.
    Assumes each element in `rows` is a dataclass (PanelRow-style).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Call each tab’s generator
    prices = generate_prices()
    sales = generate_sales()
    rates = generate_rates()
    inflation = generate_inflation()
    credit = generate_credit()
    market = generate_risk()
    supply = generate_supply()
    rentals = generate_rentals(prices, inflation)

    panel = prices + sales + rentals + rates + inflation + credit + market + supply

    write_json(DATA_DIR / "panel.json", panel)
    write_json(DATA_DIR / "prices.json", prices)
    write_json(DATA_DIR / "sales_listings.json", sales)
    write_json(DATA_DIR / "rentals.json", rentals)
    write_json(DATA_DIR / "rates_bonds.json", rates)
    write_json(DATA_DIR / "inflation_labour.json", inflation)
    write_json(DATA_DIR / "credit.json", credit)
    write_json(DATA_DIR / "market.json", market)
    write_json(DATA_DIR / "supply.json", supply)


    print(f"Wrote dashboard data to {DATA_DIR}")


if __name__ == "__main__":
    main()
