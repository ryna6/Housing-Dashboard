from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"

# Statistics Canada Web Data Service endpoint
STATCAN_WDS_URL = (
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
)

# StatCan vector IDs (numeric part of vXXXXX)
V_POLICY_RATE = 39079     # v39079 - Target for the overnight rate (%)
V_OMMFR = 39050           # v39050 - Overnight money market financing rate (%)
V_GOV_2Y_YIELD = 122538   # v122538 - 2-year GoC benchmark yield (%)
V_GOV_10Y_YIELD = 122543  # v122543 - 10-year GoC benchmark yield (%)
V_PRIME_RATE = 80691311   # v80691311 - Chartered bank prime rate (%), mortgage proxy


@dataclass
class PanelRow:
    """
    One row in the unified dashboard panel.

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


def _http_post_json(url: str, payload: Any) -> Any:
    """
    Helper to POST JSON to a URL and parse the JSON response.
    """
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
        return json.loads(body.decode("utf-8"))
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"Error POSTing to {url}: {exc}") from exc


def _parse_ref_per_to_date(ref_per: str) -> Optional[date]:
    """
    Parse a StatCan refPer string into a date.

    Handles:
      - 'YYYY-MM-DD'
      - 'YYYY-MM'
    """
    if not ref_per:
        return None
    try:
        if len(ref_per) == 10:
            return datetime.strptime(ref_per, "%Y-%m-%d").date()
        if len(ref_per) == 7:
            return datetime.strptime(ref_per + "-01", "%Y-%m-%d").date()
    except ValueError:
        return None
    return None


def _month_start(d: date) -> date:
    """Return the first day of the month for a given date."""
    return d.replace(day=1)


def fetch_statcan_vectors_monthly_last(
    vector_ids: List[int],
    years_back: int,
    latest_n: int = 5000,
) -> Dict[int, Dict[str, float]]:
    """
    Fetch StatCan vectors via WDS and aggregate to monthly frequency using
    the *last available* observation in each calendar month.

    Uses getDataFromVectorsAndLatestNPeriods with a large latestN, then
    filters to the last `years_back` years and collapses to one observation
    per month.

    Returns:
        Dict[vectorId, Dict[month_key, value]]
        where month_key is 'YYYY-MM-01'.
    """
    payload = [
        {"vectorId": vid, "latestN": latest_n}
        for vid in vector_ids
    ]

    response = _http_post_json(STATCAN_WDS_URL, payload)
    if not isinstance(response, list):
        raise RuntimeError(f"Unexpected StatCan WDS response: {response!r}")

    today = date.today()
    cutoff = date(today.year - years_back, today.month, 1)

    by_vector: Dict[int, Dict[str, float]] = {}

    for item in response:
        if not isinstance(item, dict):
            continue
        if item.get("status") != "SUCCESS":
            continue

        obj = item.get("object") or {}
        vid = obj.get("vectorId")
        if vid is None:
            continue

        # month_key -> (latest_date_in_month, value)
        month_map: Dict[str, tuple[date, float]] = {}

        for dp in obj.get("vectorDataPoint", []):
            ref_per = dp.get("refPer")
            d = _parse_ref_per_to_date(ref_per)
            if d is None or d < cutoff:
                continue

            value_str = dp.get("value")
            if value_str in (None, "", "."):
                continue

            try:
                value = float(value_str)
            except (TypeError, ValueError):
                continue

            m_start = _month_start(d)
            month_key = m_start.isoformat()

            existing = month_map.get(month_key)
            if existing is None or d > existing[0]:
                month_map[month_key] = (d, value)

        by_vector[int(vid)] = {m: v for m, (_d, v) in month_map.items()}

    return by_vector


def _compute_month_cutoff_key(years_back: int = 10) -> str:
    """
    Return the month key (YYYY-MM-01) corresponding to roughly `years_back`
    years before today.
    """
    today = date.today()
    cutoff = date(today.year - years_back, today.month, 1)
    return cutoff.isoformat()


def generate_rates(years_back: int = 10) -> List[PanelRow]:
    """
    Generate the rates & bonds panel data as a list of PanelRow dataclasses.

    Metrics and their StatCan (CANSIM-style) vectors:

      - policy_rate   -> v39079    (Target for the overnight rate, %)
      - repo_rate     -> v39050    (Overnight money market financing rate, %)
      - gov_2y_yield  -> v122538   (2-year GoC benchmark bond yield, %)
      - gov_10y_yield -> v122543   (10-year GoC benchmark bond yield, %)
      - mortgage_5y   -> v80691311 (Prime rate, %, used as mortgage proxy)

    All are aggregated to monthly by taking the last observation in each
    month, and we keep only the last `years_back` years.
    """
    region = "canada"

    vector_ids = [
        V_POLICY_RATE,
        V_OMMFR,
        V_GOV_2Y_YIELD,
        V_GOV_10Y_YIELD,
        V_PRIME_RATE,
    ]

    monthly_by_vector = fetch_statcan_vectors_monthly_last(
        vector_ids=vector_ids,
        years_back=years_back,
        latest_n=5000,
    )

    all_months = sorted(
        {m for series in monthly_by_vector.values() for m in series.keys()}
    )

    cutoff_key = _compute_month_cutoff_key(years_back)
    all_months = [m for m in all_months if m >= cutoff_key]

    rows: List[PanelRow] = []
    source = "Statistics Canada – WDS BoC interest rate vectors"

    for month_key in all_months:
        policy = monthly_by_vector.get(V_POLICY_RATE, {}).get(month_key)
        ommfr = monthly_by_vector.get(V_OMMFR, {}).get(month_key)
        gov_2y = monthly_by_vector.get(V_GOV_2Y_YIELD, {}).get(month_key)
        gov_10y = monthly_by_vector.get(V_GOV_10Y_YIELD, {}).get(month_key)
        prime = monthly_by_vector.get(V_PRIME_RATE, {}).get(month_key)

        if policy is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="policy_rate",
                    value=policy,
                    unit="pct",
                    source=source,
                )
            )

        if ommfr is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="repo_rate",
                    value=ommfr,
                    unit="pct",
                    source=f"{source} – Overnight money market financing rate (v39050)",
                )
            )

        if prime is not None:
            rows.append(
                PanelRow(
                    date=month_key,
                    region=region,
                    segment="all",
                    metric="mortgage_5y",
                    value=prime,
                    unit="pct",
                    source=f"{source} – Prime rate (v80691311) as mortgage proxy",
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
                    source=source,
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
                    source=source,
                )
            )

    return rows


def write_json(path: Path, rows: List[PanelRow]) -> None:
    """
    Convenience writer for running this module standalone.
    (generate_data.py also calls generate_rates() and handles JSON itself.)
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rates = generate_rates()
    out_path = DATA_DIR / "rates_bonds.json"
    write_json(out_path, rates)
    print(f"Wrote {len(rates)} rate rows to {out_path}")


if __name__ == "__main__":
    main()
