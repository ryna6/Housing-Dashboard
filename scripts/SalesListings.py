from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"


@dataclass
class PanelRow:
    date: str          # YYYY-MM-DD
    region: str        # must match RegionCode in the UI, e.g. "canada"
    segment: str       # "all" | "condo" | "freehold"
    metric: str        # "sales", "new_listings", etc. (later)
    value: float
    unit: str          # e.g. "count"
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_sales() -> List[PanelRow]:
    """
    Placeholder generator for the Sales tab.

    Returns an empty list so that:
      - /data/processed/sales_listings.json exists
      - SalesListingsTab can load it
      - the UI shows the title, controls, cards & charts layout,
        but with "No sales data for this selection yet."
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

