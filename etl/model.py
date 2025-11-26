from dataclasses import dataclass
from typing import Optional

@dataclass
class PanelRow:
    date: str          # YYYY-MM-01
    region: str        # canada|on|bc|gta|metro_vancouver
    segment: str       # all|condo|freehold|...
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float] = None
    yoy_pct: Optional[float] = None
    ma3: Optional[float] = None

