from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class PanelRow:
    date: str
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


def generate_overview() -> List[PanelRow]:
    """
    Placeholder generator for the Overview tab.

    For now, we return an empty list and write an empty overview.json so the
    frontend can load the tab without errors.
    """
    return []
