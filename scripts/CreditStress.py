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
    region: str        # e.g. "canada"
    segment: str       # e.g. "all"
    metric: str        # e.g. "insolvencies"
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_credit_stress() -> List[PanelRow]:
    """
    Placeholder generator for the Credit tab.

    For now this returns an empty list so the front-end treats it as
    "no data yet" but the JSON shape is correct.
    """
    return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_credit_stress()
    out_path = DATA_DIR / "credit.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} credit rows to {out_path}")


if __name__ == "__main__":
    main()

