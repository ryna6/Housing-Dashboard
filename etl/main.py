from pathlib import Path

from config import DATA_DIR
from util import ensure_empty_files

def main() -> None:
    """
    Stub ETL:
      - ensures data/processed exists
      - ensures each processed JSON file exists and contains at least []
    Later you can:
      - fetch raw data into data/raw/*
      - build a full panel DataFrame
      - compute derived metrics
      - write panel.json and per-tab JSONs
    """
    print("Running stub ETL…")
    print(f"DATA_DIR = {DATA_DIR}")
    ensure_empty_files()
    print("Processed files ensured.")

if __name__ == "__main__":
    main()
