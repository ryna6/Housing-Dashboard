from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import urllib.request
from urllib.error import HTTPError, URLError

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"

# StatCan WDS endpoint
WDS_URL = "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"


@dataclass
class PanelRow:
    """
    Shared panel row model.

    date:   "YYYY-MM-01" (first of month)
    region: e.g. "ca" for Canada
    segment: "household" | "business" | "corporate"
    metric: metric id string
    value:  numeric value (level or ratio)
    unit:   "cad" | "pct" | "ratio"
    source: data source identifier
    mom_pct: month-over-month % change
    yoy_pct: year-over-year % change
    ma3:   trailing 3-period moving average of value
    """

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


# ---------- generic helpers ----------


def _compute_changes(
    values: List[float],
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    Compute MoM %, YoY %, and 3-period moving average for a series.

    mom_pct[i] = (v[i] / v[i-1] - 1) * 100  (if previous exists and non-zero)
    yoy_pct[i] = (v[i] / v[i-12] - 1) * 100 (if 12-month lag exists and non-zero)
    ma3[i]     = trailing mean over last up to 3 observations
    """
    n = len(values)
    mom: List[Optional[float]] = [None] * n
    yoy: List[Optional[float]] = [None] * n
    ma3: List[Optional[float]] = [None] * n

    for i, v in enumerate(values):
        # MoM
        if i > 0:
            prev = values[i - 1]
            if prev not in (0, 0.0):
                mom[i] = (v / prev - 1.0) * 100.0

        # YoY (12-month lag)
        if i >= 12:
            prev12 = values[i - 12]
            if prev12 not in (0, 0.0):
                yoy[i] = (v / prev12 - 1.0) * 100.0

        # trailing 3-period MA (use fewer than 3 points at start)
        start = max(0, i - 2)
        window = values[start : i + 1]
        ma3[i] = sum(window) / len(window)

    return mom, yoy, ma3


def _fetch_vectors(vector_ids: List[str], latest_n: int = 1000) -> Dict[str, Dict[str, float]]:
    """
    Fetch time series for given StatCan vector IDs via WDS.

    Returns:
        { "v123456": { "YYYY-MM-01": value_in_millions, ... }, ... }
    """
    if not vector_ids:
        return {}

    # Map numeric id -> "v1234" form
    id_map: Dict[int, str] = {int(v.lstrip("vV")): v for v in vector_ids}

    payload = [
        {"vectorId": numeric_id, "latestN": latest_n}
        for numeric_id in sorted(id_map.keys())
    ]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        WDS_URL,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"Failed to fetch StatCan vectors {vector_ids}: {exc}") from exc

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from StatCan WDS for vectors {vector_ids}") from exc

    if not isinstance(parsed, list):
        raise RuntimeError(f"Unexpected WDS response shape: {parsed!r}")

    result: Dict[str, Dict[str, float]] = {}

    # Each entry corresponds to one vector
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        if entry.get("status") != "SUCCESS":
            # If one vector fails, we skip it (you can tighten this to raise instead)
            continue

        obj = entry.get("object") or {}
        numeric_id = obj.get("vectorId")
        if numeric_id is None:
            continue

        v_code = id_map.get(int(numeric_id))
        if v_code is None:
            continue

        series: Dict[str, float] = {}
        for dp in obj.get("vectorDataPoint", []):
            ref_per = dp.get("refPer")
            if not ref_per:
                continue
            # Monthly data are dated to first of month; normalise to YYYY-MM-01
            date_str = ref_per[:7] + "-01"
            try:
                value = float(dp.get("value"))
            except (TypeError, ValueError):
                continue
            series[date_str] = value

        # make sure iteration order is ascending by date
        result[v_code] = {k: series[k] for k in sorted(series.keys())}

    return result


def _build_metric_rows(
    *,
    segment: str,
    metric: str,
    unit: str,
    date_to_value: Dict[str, float],
    source: str,
) -> List[PanelRow]:
    """
    Convert a date->value series into PanelRow objects with MoM / YoY / MA3.
    """
    if not date_to_value:
        return []

    dates = sorted(date_to_value.keys())
    values = [date_to_value[d] for d in dates]

    mom, yoy, ma3 = _compute_changes(values)

    rows: List[PanelRow] = []
    for dt, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt,
                region="canada",
                segment=segment,
                metric=metric,
                value=round(val, 2),
                unit=unit,
                source=source,
                mom_pct=round(m, 3) if m is not None else None,
                yoy_pct=round(y, 3) if y is not None else None,
                ma3=round(ma, 3) if ma is not None else None,
            )
        )
    return rows


# ---------- main generator ----------


def generate_credit() -> List[PanelRow]:
    """
    Entry point used by scripts/generate_data.py.

    Fetches StatCan WDS series, converts to dollars where required,
    computes derived ratios, and returns PanelRow objects for:

      - Household view
      - Business view
      - Corporate debt view
    """
    # Household vectors (monthly SA, millions of dollars)
    v_household_non_mortgage = "v1231415611"
    v_household_mortgage = "v1231415620"
    v_household_total_credit = "v1231415625"  # denominator only
    v_household_loc = "v1231415615"

    # Business vectors
    v_business_non_mortgage = "v1231415688"
    v_business_mortgage = "v1231415692"
    v_business_total_credit = "v1304432231"  # denominator for share
    v_business_debt_sec = "v1231415697"

    # Corporate vectors (private NFCs)
    v_corp_debt_sec = v_business_debt_sec
    v_corp_equity_sec = "v1231415700"
    v_corp_total_credit = v_business_total_credit

    all_vectors = sorted(
        {
            v_household_non_mortgage,
            v_household_mortgage,
            v_household_total_credit,
            v_household_loc,
            v_business_non_mortgage,
            v_business_mortgage,
            v_business_total_credit,
            v_business_debt_sec,
            v_corp_equity_sec,
        }
    )

    # Fetch all required vector series in one call
    vector_series = _fetch_vectors(all_vectors, latest_n=1000)

    rows: List[PanelRow] = []

    # ------------------------------------------------------------------
    # 1. Household view
    # ------------------------------------------------------------------
    seg = "household"

    # Levels: millions -> plain dollars
    household_non_mortgage = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_household_non_mortgage, {}).items()
    }
    household_mortgage = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_household_mortgage, {}).items()
    }
    household_loc = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_household_loc, {}).items()
    }

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="household_non_mortgage_loans",
            unit="cad",
            date_to_value=household_non_mortgage,
            source=f"statcan_{v_household_non_mortgage}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="household_mortgage_loans",
            unit="cad",
            date_to_value=household_mortgage,
            source=f"statcan_{v_household_mortgage}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="household_loc",
            unit="cad",
            date_to_value=household_loc,
            source=f"statcan_{v_household_loc}",
        )
    )

    # Derived: mortgage share of household credit (%)
    hh_mortgage_raw = vector_series.get(v_household_mortgage, {})
    hh_total_raw = vector_series.get(v_household_total_credit, {})
    mortgage_share: Dict[str, float] = {}
    for dt in sorted(set(hh_mortgage_raw.keys()) & set(hh_total_raw.keys())):
        num = hh_mortgage_raw.get(dt)
        denom = hh_total_raw.get(dt)
        if num is None or denom in (None, 0, 0.0):
            continue
        mortgage_share[dt] = (num / denom) * 100.0

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="household_mortgage_share",
            unit="pct",
            date_to_value=mortgage_share,
            source=f"statcan_derived_{v_household_mortgage}_{v_household_total_credit}",
        )
    )

    # ------------------------------------------------------------------
    # 2. Business view
    # ------------------------------------------------------------------
    seg = "business"

    business_non_mortgage = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_business_non_mortgage, {}).items()
    }
    business_mortgage = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_business_mortgage, {}).items()
    }
    business_debt_sec = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_business_debt_sec, {}).items()
    }

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="business_non_mortgage_loans",
            unit="cad",
            date_to_value=business_non_mortgage,
            source=f"statcan_{v_business_non_mortgage}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="business_mortgage_loans",
            unit="cad",
            date_to_value=business_mortgage,
            source=f"statcan_{v_business_mortgage}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="business_debt_securities",
            unit="cad",
            date_to_value=business_debt_sec,
            source=f"statcan_{v_business_debt_sec}",
        )
    )

    # Derived: business loans share of total credit (%)
    biz_non_raw = vector_series.get(v_business_non_mortgage, {})
    biz_mort_raw = vector_series.get(v_business_mortgage, {})
    biz_total_raw = vector_series.get(v_business_total_credit, {})

    biz_share: Dict[str, float] = {}
    common_dates = (
        set(biz_non_raw.keys()) & set(biz_mort_raw.keys()) & set(biz_total_raw.keys())
    )
    for dt in sorted(common_dates):
        nm = biz_non_raw.get(dt)
        mt = biz_mort_raw.get(dt)
        denom = biz_total_raw.get(dt)
        if nm is None or mt is None or denom in (None, 0, 0.0):
            continue
        loans_total = nm + mt
        biz_share[dt] = (loans_total / denom) * 100.0

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="business_loans_share",
            unit="pct",
            date_to_value=biz_share,
            source=f"statcan_derived_{v_business_non_mortgage}_{v_business_mortgage}_{v_business_total_credit}",
        )
    )

    # ------------------------------------------------------------------
    # 3. Corporate debt view (private NFCs)
    # ------------------------------------------------------------------
    seg = "corporate"

    corp_debt_sec = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_corp_debt_sec, {}).items()
    }
    corp_equity_sec = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_corp_equity_sec, {}).items()
    }
    corp_total_credit = {
        d: val * 1_000_000.0 for d, val in vector_series.get(v_corp_total_credit, {}).items()
    }

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="corp_debt_securities",
            unit="cad",
            date_to_value=corp_debt_sec,
            source=f"statcan_{v_corp_debt_sec}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="corp_equity_securities",
            unit="cad",
            date_to_value=corp_equity_sec,
            source=f"statcan_{v_corp_equity_sec}",
        )
    )
    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="corp_credit_total",
            unit="cad",
            date_to_value=corp_total_credit,
            source=f"statcan_{v_corp_total_credit}",
        )
    )

    # Derived: debt-to-equity ratio (unitless)
    corp_total_raw = vector_series.get(v_corp_total_credit, {})
    corp_equity_raw = vector_series.get(v_corp_equity_sec, {})
    debt_to_equity: Dict[str, float] = {}
    for dt in sorted(set(corp_total_raw.keys()) & set(corp_equity_raw.keys())):
        total_credit = corp_total_raw.get(dt)
        equity = corp_equity_raw.get(dt)
        if equity in (None, 0, 0.0) or total_credit is None:
            continue
        debt_to_equity[dt] = total_credit / equity

    rows.extend(
        _build_metric_rows(
            segment=seg,
            metric="corp_debt_to_equity",
            unit="ratio",
            date_to_value=debt_to_equity,
            source=f"statcan_derived_{v_corp_total_credit}_{v_corp_equity_sec}",
        )
    )

    return rows


def _write_json(path: Path, rows: List[PanelRow]) -> None:
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    """
    Standalone entry: python scripts/Credit.py

    (Netlify build still uses scripts/generate_data.py as the orchestrator.)
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_credit()
    out_path = DATA_DIR / "credit.json"
    _write_json(out_path, rows)
    print(f"Wrote {len(rows)} credit rows to {out_path}")


if __name__ == "__main__":
    main()
