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
    date: str          # YYYY-MM-DD (first of month)
    region: str
    segment: str
    metric: str        # e.g. "tsx", "credit_spread"
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_market() -> List[PanelRow]:
    """
    Placeholder generator for the Market tab.

    Currently returns an empty list. Real equity / spread data
    can plug in here later.
    """
    return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_market()
    out_path = DATA_DIR / "market.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} market rows to {out_path}")


if __name__ == "__main__":
    main()

