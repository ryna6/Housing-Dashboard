from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"


@dataclass
class PanelRow:
    """
    Generic panel row used by the dashboard front-end.

    date   : YYYY-MM-01 (month start)
    region : region code such as "canada"
    segment: usually "all" for national-level series
    metric : metric identifier (e.g., "policy_rate", "repo_rate")
    value  : numeric value (percent)
    unit   : short unit label ("pct")
    source : data source description
    mom_pct, yoy_pct, ma3: optional change / smoothing fields, unused here
    """

    date: str
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float] = None
    yoy_pct: Optional[float] = None
    ma3: Optional[float] = None


def _http_get_json(url: str) -> Dict:
    try:
        with urllib.request.urlopen(url) as resp:
            data = resp.read()
        return json.loads(data.decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"Error fetching {url}: {exc}") from exc


def _month_key_from_iso(date_str: str) -> str:
    """Return YYYY-MM-01 from a YYYY-MM-DD string."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").date()
    month_start = dt.replace(day=1)
    return month_start.isoformat()


def fetch_boc_series_monthly_last(
    series_ids: List[str],
    start: str,
    end: Optional[str] = None,
) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more Bank of Canada Valet series and aggregate to monthly levels.

    For each calendar month we keep the *last* available daily observation.

    Returns:
        Dict[month_key, Dict[series_id, value]]
        where month_key is YYYY-MM-01.
    """
    base = "https://www.bankofcanada.ca/valet/observations"
    ids_param = ",".join(series_ids)

    params = [f"start_date={start}"]
    if end is not None:
        params.append(f"end_date={end}")
    query = "&".join(params)

    url = f"{base}/{ids_param}/json?{query}"

    payload = _http_get_json(url)
    observations = payload.get("observations", [])

    monthly_last: Dict[str, Dict[str, float]] = defaultdict(dict)

    for obs in observations:
        d = obs.get("d")
        if not d:
            continue
        month_key = _month_key_from_iso(d)

        for sid in series_ids:
            entry = obs.get(sid)
            if not isinstance(entry, dict):
                continue
            v = entry.get("v")
            if v in (None, "", "."):
                continue
            try:
                monthly_last[month_key][sid] = float(v)
            except ValueError:
                # Skip malformed values
                continue

    return monthly_last


def _compute_start_for_years_back(years_back: int = 10) -> str:
    """
    Compute an ISO start date roughly `years_back` years before today,
    aligned to the first of the month.
    """
    today = date.today()
    start_year = today.year - years_back
    # Keep the same month to get a rolling 10-year window
    start_month = today.month
    start = date(start_year, start_month, 1)
    return start.isoformat()


def generate_rates(years_back: int = 10) -> List[Dict]:
    """
    Generate the rates & bonds panel data as a flat list of dicts suitable
    for JSON export.

    Metrics → BoC Valet series:
      - policy_rate       -> V39079    (Target for the overnight rate, %)
      - gov_2y_yield      -> V122538   (2-year GoC benchmark bond yield, %)
      - gov_5y_yield      -> V122540   (5-year GoC benchmark bond yield, %)
      - gov_10y_yield     -> V122487   (Long-term GoC bond yield >10y, %)
      - mortgage_5y       -> V80691311 (Conventional 5-year mortgage rate, %)
      - repo_rate (CORRA) -> AVG.INTWO (Canadian Overnight Repo Rate Average, %)
      - repo_fallback     -> V39050    (Overnight money market financing rate, %)

    Repo rate construction:
      For each month, prefer AVG.INTWO (CORRA). If it is missing for that month,
      fall back to V39050.
    """
    region = "canada"

    # All series we want to pull in one Valet call
    series_ids = [
        "V39079",    # policy_rate
        "V122538",   # gov_2y_yield
        "V122540",   # gov_5y_yield
        "V122487",   # gov_10y_yield
        "V80691311", # mortgage_5y
        "AVG.INTWO", # CORRA
        "V39050",    # Overnight money market financing rate
    ]

    start = _compute_start_for_years_back(years_back)
    monthly = fetch_boc_series_monthly_last(series_ids, start=start)

    rows: List[PanelRow] = []

    for month_key in sorted(monthly.keys()):
        values = monthly[month_key]

        policy = values.get("V39079")
        gov_2y = values.get("V122538")
        gov_5y = values.get("V122540")
        gov_10y = values.get("V122487")
        mort_5y = values.get("V80691311")

        corra = values.get("AVG.INTWO")
        ommfr = values.get("V39050")
        repo = corra if corra is not None else ommfr

        source_boc = "Bank of Canada – Valet API"

        if policy is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="policy_rate",
                    value=policy,
                    unit="pct",
                    source=source_boc,
                )
            )

        if repo is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="repo_rate",
                    value=repo,
                    unit="pct",
                    source=(
                        "BoC CORRA (AVG.INTWO) where available, "
                        "otherwise Overnight money market financing rate (V39050)"
                    ),
                )
            )

        if mort_5y is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="mortgage_5y",
                    value=mort_5y,
                    unit="pct",
                    source=source_boc,
                )
            )

        if gov_2y is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="gov_2y_yield",
                    value=gov_2y,
                    unit="pct",
                    source=source_boc,
                )
            )

        if gov_10y is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="gov_10y_yield",
                    value=gov_10y,
                    unit="pct",
                    source=source_boc,
                )
            )

        # Derived: mortgage_5y_spread = mortgage_5y - gov_5y_yield
        if mort_5y is not None and gov_5y is not None:
            spread = mort_5y - gov_5y
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="mortgage_5y_spread",
                    value=spread,
                    unit="pct",
                    source="Derived: mortgage_5y (V80691311) - 5y GoC yield (V122540)",
                )
            )

    # Convert to plain dicts for JSON serialization
    return [asdict(r) for r in rows]


def write_json(path: Path, data: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rates = generate_rates()
    out_path = DATA_DIR / "rates_bonds.json"
    write_json(out_path, rates)
    print(f"Wrote {len(rates)} rate rows to {out_path}")


if __name__ == "__main__":
    main()
