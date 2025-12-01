# scripts/Market.py
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import urllib.request
from urllib.error import HTTPError, URLError

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

@dataclass
class PanelRow:
    date: str          # YYYY-MM-DD (first of month)
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

# StatCan Web Data Service endpoint for vectors :contentReference[oaicite:1]{index=1}
STATCAN_WDS_URL = (
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
)

# ---- StatCan vectors ----
# GDP vector is intentionally left as a placeholder because it depends on
# your exact choice of "Canada / All industries / Real chained (2017) dollars"
# in table 36-10-0434-01.
GDP_VECTOR_ID = "v65201210"  

# Money supply (table 10-10-0116-01), monthly, millions of dollars
M2_VECTOR_ID = "v41552796"   # M2 (gross)
M2PP_VECTOR_ID = "v41552801"  # M2++ (gross)

STATCAN_LATEST_N = 600  # enough to cover decades of monthly data


def _statcan_vector_id_to_int(vec: str) -> int:
    """Convert 'v41552796' -> 41552796."""
    v = vec.lower().lstrip("v")
    return int(v)


def fetch_statcan_vectors(
    vector_ids: List[str], latest_n: int = STATCAN_LATEST_N
) -> Dict[str, Dict[str, float]]:
    """
    Call StatCan WDS getDataFromVectorsAndLatestNPeriods for a set of vectors.

    Returns:
        {
          "v41552796": {"YYYY-MM-01": value_in_original_units, ...},
          ...
        }
    """
    payload = [
        {"vectorId": _statcan_vector_id_to_int(vec), "latestN": latest_n}
        for vec in vector_ids
    ]

    req = urllib.request.Request(
        STATCAN_WDS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except (HTTPError, URLError) as e:
        print(f"[Market] StatCan WDS request failed: {e}")
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print("[Market] Failed to parse StatCan WDS JSON response")
        return {}

    result: Dict[str, Dict[str, float]] = {}
    for item in parsed:
        if item.get("status") != "SUCCESS":
            continue
        obj = item.get("object") or {}
        vec_id_int = obj.get("vectorId")
        if vec_id_int is None:
            continue
        vec_id_str = f"v{vec_id_int}"
        series: Dict[str, float] = {}
        for dp in obj.get("vectorDataPoint", []):
            ref_per = dp.get("refPer")
            value_str = dp.get("value")
            if not ref_per or value_str in (None, "", "NaN", "nan"):
                continue
            try:
                value = float(value_str)
            except ValueError:
                continue
            # Normalize to YYYY-MM-01
            try:
                dt = datetime.strptime(ref_per, "%Y-%m-%d")
                date_str = dt.strftime("%Y-%m-01")
            except ValueError:
                # Fallback: raw string
                date_str = ref_per
            series[date_str] = value
        result[vec_id_str] = series

    return result


def _read_finnhub_candles(json_path: Path, label: str) -> Dict[str, float]:
    """
    Read Finnhub candles (t, c arrays) and return monthly close series:
    { 'YYYY-MM-01': close_price, ... }

    Expects raw JSON saved from stock/candle endpoint. :contentReference[oaicite:2]{index=2}
    """
    if not json_path.exists():
        print(f"[Market] Warning: missing Finnhub raw file for {label}: {json_path}")
        return {}

    try:
        raw = json.loads(json_path.read_text())
    except json.JSONDecodeError:
        print(f"[Market] Warning: invalid JSON in {json_path}")
        return {}

    status = raw.get("s")
    if status not in ("ok", "no_data"):
        print(f"[Market] Warning: Finnhub status for {label} is {status!r}")
        return {}

    t_list = raw.get("t") or []
    c_list = raw.get("c") or []
    if not t_list or not c_list or len(t_list) != len(c_list):
        print(f"[Market] Warning: candle length mismatch for {label}")
        return {}

    series: Dict[str, float] = {}
    for ts, close in zip(t_list, c_list):
        try:
            # Finnhub timestamps are seconds since epoch (UTC) :contentReference[oaicite:3]{index=3}
            dt = datetime.utcfromtimestamp(ts)
        except Exception:
            continue
        date_str = dt.strftime("%Y-%m-01")
        series[date_str] = float(close)

    return series


def _normalize_to_index(series: Dict[str, float]) -> Dict[str, float]:
    """
    Normalize a price series to 100 at the first available month.
    """
    if not series:
        return {}
    dates_sorted = sorted(series.keys())
    base_value = series[dates_sorted[0]]
    if base_value == 0:
        return {}
    return {d: (series[d] / base_value) * 100.0 for d in dates_sorted}


def _build_panel_rows_for_series(
    metric_id: str,
    unit: str,
    source: str,
    series: Dict[str, float],
) -> List[PanelRow]:
    """
    Turn a {date: value} series into PanelRow list with mom_pct, yoy_pct, ma3.
    """
    if not series:
        return []

    dates_sorted = sorted(series.keys())
    values = [series[d] for d in dates_sorted]
    rows: List[PanelRow] = []

    for i, date_str in enumerate(dates_sorted):
        value = values[i]

        mom_pct: Optional[float] = None
        if i > 0 and values[i - 1] != 0:
            mom_pct = (value / values[i - 1] - 1.0) * 100.0

        yoy_pct: Optional[float] = None
        if i >= 12 and values[i - 12] != 0:
            yoy_pct = (value / values[i - 12] - 1.0) * 100.0

        window = values[max(0, i - 2) : i + 1]
        ma3: Optional[float] = sum(window) / len(window) if window else None

        rows.append(
            PanelRow(
                date=date_str,
                region="ca",
                segment="market",
                metric=metric_id,
                value=round(value, 2),
                unit=unit,
                source=source,
                mom_pct=round(mom_pct, 2) if mom_pct is not None else None,
                yoy_pct=round(yoy_pct, 2) if yoy_pct is not None else None,
                ma3=round(ma3, 2) if ma3 is not None else None,
            )
        )

    return rows


def _generate_gdp_rows() -> List[PanelRow]:
    if GDP_VECTOR_ID.startswith("vX") or GDP_VECTOR_ID.startswith("vx"):
        # Fail loudly so you remember to fill this.
        print(
            "[Market] GDP_VECTOR_ID is still the placeholder 'vXXXXX'. "
            "Choose the correct StatCan vector for Canada / All industries / "
            "Real chained (2017) dollars in table 36-10-0434-01 and update "
            "GDP_VECTOR_ID in Market.py."
        )
        return []

    statcan_data = fetch_statcan_vectors([GDP_VECTOR_ID])
    gdp_series = statcan_data.get(GDP_VECTOR_ID, {})
    # Convert from millions of chained dollars to plain dollars (x 1,000,000). :contentReference[oaicite:4]{index=4}
    gdp_dollars = {d: v * 1_000_000.0 for d, v in gdp_series.items()}
    return _build_panel_rows_for_series(
        metric_id="ca_real_gdp",
        unit="cad",
        source=f"statcan_36-10-0434-01_{GDP_VECTOR_ID}",
        series=gdp_dollars,
    )


def _generate_money_rows() -> List[PanelRow]:
    statcan_data = fetch_statcan_vectors([M2_VECTOR_ID, M2PP_VECTOR_ID])

    m2_series = statcan_data.get(M2_VECTOR_ID, {})
    m2pp_series = statcan_data.get(M2PP_VECTOR_ID, {})

    # Convert from millions of dollars to dollars (x 1,000,000). :contentReference[oaicite:5]{index=5}
    m2_dollars = {d: v * 1_000_000.0 for d, v in m2_series.items()}
    m2pp_dollars = {d: v * 1_000_000.0 for d, v in m2pp_series.items()}

    rows: List[PanelRow] = []
    rows.extend(
        _build_panel_rows_for_series(
            metric_id="ca_m2",
            unit="cad",
            source=f"statcan_10-10-0116-01_{M2_VECTOR_ID}",
            series=m2_dollars,
        )
    )
    rows.extend(
        _build_panel_rows_for_series(
            metric_id="ca_m2pp",
            unit="cad",
            source=f"statcan_10-10-0116-01_{M2PP_VECTOR_ID}",
            series=m2pp_dollars,
        )
    )
    return rows


def _generate_tsx_rows() -> List[PanelRow]:
    tsx_raw_path = RAW_DATA_DIR / "tsx_finnhub.json"
    tsx_close_series = _read_finnhub_candles(tsx_raw_path, label="TSX Composite")
    if not tsx_close_series:
        return []
    tsx_index_series = _normalize_to_index(tsx_close_series)

    return _build_panel_rows_for_series(
        metric_id="tsx_composite_index",
        unit="index",
        source="finnhub_tsx_composite",
        series=tsx_index_series,
    )


def _generate_xre_rows() -> List[PanelRow]:
    xre_raw_path = RAW_DATA_DIR / "xre_finnhub.json"
    xre_close_series = _read_finnhub_candles(xre_raw_path, label="XRE ETF")
    if not xre_close_series:
        return []
    xre_index_series = _normalize_to_index(xre_close_series)

    return _build_panel_rows_for_series(
        metric_id="xre_price_index",
        unit="index",
        source="finnhub_xre_etf",
        series=xre_index_series,
    )


def generate_market() -> List[PanelRow]:
    """
    Generate all Market tab data:

    - ca_real_gdp
    - tsx_composite_index
    - xre_price_index
    - ca_m2
    - ca_m2pp
    """
    rows: List[PanelRow] = []

    rows.extend(_generate_gdp_rows())
    rows.extend(_generate_tsx_rows())
    rows.extend(_generate_xre_rows())
    rows.extend(_generate_money_rows())

    # You don't *have* to write market.json here (generate_data.py will), but
    # this makes the module testable standalone:
    if rows:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        market_json_path = DATA_DIR / "market.json"
        market_json_path.write_text(
            json.dumps([asdict(r) for r in rows], indent=2),
            encoding="utf-8",
        )
        print(f"[Market] Wrote {len(rows)} rows to {market_json_path}")

    return rows
