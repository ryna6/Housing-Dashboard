from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"

# Expected processed files (front-end reads these)
PROCESSED_FILES = [
    "panel.json",
    "prices.json",
    "sales_listings.json",
    "supply_pipeline.json",
    "rates_bonds.json",
    "inflation_labour.json",
    "credit_stress.json",
    "market_risk.json",
    "rentals.json",
]

