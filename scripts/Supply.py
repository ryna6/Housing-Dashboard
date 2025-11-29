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
    region: str
    segment: str       # e.g. "all"
    metric: str        # e.g. "starts", "completions", etc. later
    value: float
    unit: str          # e.g. "count"
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_supply() -> List[PanelRow]:
    """
    Placeholder generator for the Supply tab.

    Currently returns an empty list; CMHC series can be wired in later.
    """
    return []


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_supply()
    out_path = DATA_DIR / "supply.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} supply rows to {out_path}")


if __name__ == "__main__":
    main()

