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
    region: str        # e.g. "canada"
    segment: str       # e.g. "all", "apt", "house" in the future
    metric: str        # e.g. "rent_index", "vacancy_rate" later
    value: float
    unit: str          # e.g. "index", "pct", "cad"
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_rentals() -> List[PanelRow]:
    """
    Placeholder generator for the Rentals tab.

    For now this returns an empty list so that:
      - /data/processed/rentals.json exists
      - Rentals tab can load it without errors
      - UI shows the title / cards / graphs layout, but with
        "no data" messages where appropriate.
    """
    return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_rentals()
    out_path = DATA_DIR / "rentals.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} rentals rows to {out_path}")


if __name__ == "__main__":
    main()

