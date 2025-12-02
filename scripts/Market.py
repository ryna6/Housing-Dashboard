# scripts/Market.py
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import urllib.request
from urllib.error import HTTPError, URLError

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"


@dataclass
class PanelRow:
    date: str          # "YYYY-MM-01"
    region: str        # e.g. "canada"
    segment: str       # e.g. "market"
    metric: str        # e.g. "ca_real_gdp"
    value: float
    unit: str          # "cad" | "index"
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


# ---------------------------------------------------------------------------
# StatCan WDS helpers
# ---------------------------------------------------------------------------

STATCAN_WDS_URL = (
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
)

# GDP: real, chained (2017) dollars, all industries, Canada, monthly
# Table 36-10-0434-01; vector ID chosen for Canada / all industries / real chained.
GDP_VECTOR_ID = "v65201210"

# Money supply (table 10-10-0116-01), monthly, millions of dollars
M2_VECTOR_ID = "v41552796"    # M2 (gross)
M2PP_VECTOR_ID = "v41552801"  # M2++ (gross)


def _statcan_vector_id_to_int(vector_id: str) -> int:
    """Convert 'v41552796' or 'V41552796' → 41552796."""
    v = vector_id.strip()
    if v.lower().startswith("v"):
        v = v[1:]
    return int(v)


def fetch_statcan_vectors(
    vector_ids: List[str],
    latest_n: int = 600,
) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more StatCan vectors via WDS getDataFromVectorsAndLatestNPeriods.

    Returns:
        {
          "v12345": {"YYYY-MM-01": value, ...},
          "v67890": {"YYYY-MM-01": value, ...},
        }

    Values are as returned by WDS (e.g. millions of dollars); callers can rescale.
    """
    if not vector_ids:
        return {}

    payload = [
        {"vectorId": _statcan_vector_id_to_int(vec), "latestN": latest_n}
        for vec in vector_ids
    ]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        STATCAN_WDS_URL,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "housing-dashboard-market",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except (HTTPError, URLError) as e:
        print(f"[Market] StatCan WDS request failed: {e}")
        return {}

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        print("[Market] Failed to parse StatCan WDS JSON response")
        return {}

    result: Dict[str, Dict[str, float]] = {}

    # Expected shape:
    # [
    #   {
    #     "status": "SUCCESS",
    #     "object": {
    #       "vectorId": 42076,
    #       "vectorDataPoint": [
    #         {"refPer": "2017-07-01", "value": "18381", ...},
    #         ...
    #       ]
    #     }
    #   },
    #   ...
    # ]
    for item in items:
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
            val = dp.get("value")
            if ref_per in (None, "", "NaN", "nan") or val in (None, "", "NaN", "nan"):
                continue
            try:
                value = float(val)
            except (TypeError, ValueError):
                continue

            # Normalize to YYYY-MM-01
            try:
                dt = datetime.strptime(ref_per, "%Y-%m-%d")
                date_str = dt.strftime("%Y-%m-01")
            except ValueError:
                date_str = ref_per

            series[date_str] = value

        result[vec_id_str] = series

    return result


# ---------------------------------------------------------------------------
# Alpha Vantage raw data reader (no API calls here)
# ---------------------------------------------------------------------------

# ---- Index scaling baselines (XIU → TSX, XRE → REIT) ----
# Based on December 1st 2025 closes you provided:
#   XIU close: 46.00, TSX Composite: 31,101.78
#   XRE close: 15.38, REIT index: 154.89

TSX_PROXY_PRICE_BASE = 46.0
TSX_INDEX_BASE_LEVEL = 31101.78
TSX_INDEX_SCALE_FACTOR = TSX_INDEX_BASE_LEVEL / TSX_PROXY_PRICE_BASE  # ≈ 676.125652

XRE_PROXY_PRICE_BASE = 15.38
REIT_INDEX_BASE_LEVEL = 154.89
REIT_INDEX_SCALE_FACTOR = REIT_INDEX_BASE_LEVEL / XRE_PROXY_PRICE_BASE  # ≈ 10.070871


def _read_alphavantage_candles(json_path: Path, label: str) -> Dict[str, float]:
    """
    Read Alpha Vantage-derived candles (t, c arrays) and return monthly close series:
        { 'YYYY-MM-01': close_price, ... }

    Expects raw JSON saved by the Alpha Vantage updater script
    (TIME_SERIES_MONTHLY → candles with keys 't' and 'c').
    """
    if not json_path.exists():
        print(f"[Market] Warning: missing Alpha Vantage raw file for {label}: {json_path}")
        return {}

    try:
        raw = json.loads(json_path.read_text())
    except json.JSONDecodeError:
        print(f"[Market] Warning: invalid JSON in {json_path}")
        return {}

    status = raw.get("s")
    if status not in ("ok", "no_data"):
        print(f"[Market] Warning: Alpha Vantage status for {label} is {status!r}")
        return {}

    t_list = raw.get("t") or []
    c_list = raw.get("c") or []

    if not isinstance(t_list, list) or not isinstance(c_list, list) or len(t_list) != len(c_list):
        print(f"[Market] Warning: unexpected Alpha Vantage candles structure in {json_path}")
        return {}

    series: Dict[str, float] = {}
    for ts, close in zip(t_list, c_list):
        try:
            ts_int = int(ts)
            close_val = float(close)
        except (TypeError, ValueError):
            continue
        dt = datetime.utcfromtimestamp(ts_int)
        date_str = dt.strftime("%Y-%m-01")
        series[date_str] = close_val

    return series


# ---------------------------------------------------------------------------
# Shared helper: series → PanelRow list with MoM / YoY / MA3
# ---------------------------------------------------------------------------


def _build_panel_rows_for_series(
    metric_id: str,
    unit: str,
    source: str,
    series: Dict[str, float],
) -> List[PanelRow]:
    """
    Turn a date->value series into a list of PanelRow with MoM, YoY, and MA3.
    """
    if not series:
        return []

    items = sorted(series.items(), key=lambda kv: kv[0])
    dates = [d for (d, _) in items]
    values = [v for (_, v) in items]

    rows: List[PanelRow] = []
    for i, (date_str, value) in enumerate(zip(dates, values)):
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
                region="canada",          # <-- important for frontend filters
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


def _normalize_tsx_to_index(series: Dict[str, float]) -> Dict[str, float]:
    """
    Scale XIU ETF prices so that the chosen baseline close (~46)
    corresponds to the actual TSX Composite index level (~31,101.78).

    This keeps all % changes the same but puts the series in
    "index points" similar to the real TSX Composite.
    """
    if not series:
        return {}

    dates_sorted = sorted(series.keys())
    factor = TSX_INDEX_SCALE_FACTOR
    return {d: series[d] * factor for d in dates_sorted}


def _normalize_reit_to_index(series: Dict[str, float]) -> Dict[str, float]:
    """
    Scale XRE ETF prices so that the chosen baseline close (~15.38)
    corresponds to the actual REIT index level (~154.89).
    """
    if not series:
        return {}

    dates_sorted = sorted(series.keys())
    factor = REIT_INDEX_SCALE_FACTOR
    return {d: series[d] * factor for d in dates_sorted}


# ---------------------------------------------------------------------------
# Metric-specific generators
# ---------------------------------------------------------------------------


def _generate_gdp_rows() -> List[PanelRow]:
    """
    Canada real GDP, monthly, all industries, chained 2017 dollars.
    """
    statcan_data = fetch_statcan_vectors([GDP_VECTOR_ID], latest_n=600)
    gdp_series = statcan_data.get(GDP_VECTOR_ID, {})

    # Convert from millions of chained dollars to plain dollars (× 1,000,000)
    gdp_dollars = {d: v * 1_000_000.0 for d, v in gdp_series.items()}

    return _build_panel_rows_for_series(
        metric_id="ca_real_gdp",
        unit="cad",
        source=f"statcan_36-10-0434-01_{GDP_VECTOR_ID}",
        series=gdp_dollars,
    )


def _generate_money_rows() -> List[PanelRow]:
    """
    Money supply: M2 and M2++, monthly, millions of dollars → dollars.
    """
    statcan_data = fetch_statcan_vectors(
        [M2_VECTOR_ID, M2PP_VECTOR_ID],
        latest_n=600,
    )

    m2_series = statcan_data.get(M2_VECTOR_ID, {})
    m2pp_series = statcan_data.get(M2PP_VECTOR_ID, {})

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
    """
    TSX Composite proxy (XIU ETF), monthly closes from Alpha Vantage candles.
    """
    tsx_raw_path = RAW_DATA_DIR / "tsx_alphavantage.json"  # written by Alpha Vantage updater
    tsx_close_series = _read_alphavantage_candles(tsx_raw_path, label="TSX Composite")
    if not tsx_close_series:
        return []

    tsx_index_series = _normalize_tsx_to_index(tsx_close_series)

    return _build_panel_rows_for_series(
        metric_id="tsx_composite_index",
        unit="index",
        source="alphavantage_tsx_proxy",
        series=tsx_index_series,
    )


def _generate_xre_rows() -> List[PanelRow]:
    """
    XRE REIT ETF index, monthly closes from Alpha Vantage candles,
    normalized to 100 at the first available month.
    """
    xre_raw_path = RAW_DATA_DIR / "xre_alphavantage.json"  # written by Alpha Vantage updater
    xre_close_series = _read_alphavantage_candles(xre_raw_path, label="XRE ETF")
    if not xre_close_series:
        return []

    xre_index_series = _normalize_reit_to_index(xre_close_series)

    return _build_panel_rows_for_series(
        metric_id="xre_price_index",
        unit="index",
        source="alphavantage_xre_etf",
        series=xre_index_series,
    )


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


def generate_market() -> List[PanelRow]:
    """
    Main entry point: generate all PanelRow records for the Market tab.

    Metrics:
      - ca_real_gdp         (StatCan 36-10-0434-01 via WDS)
      - tsx_composite_index (Alpha Vantage TSX proxy ETF → candles)
      - xre_price_index     (Alpha Vantage XRE ETF → candles)
      - ca_m2               (StatCan 10-10-0116-01, v41552796)
      - ca_m2pp             (StatCan 10-10-0116-01, v41552801)
    """
    rows: List[PanelRow] = []
    rows.extend(_generate_gdp_rows())
    rows.extend(_generate_tsx_rows())
    rows.extend(_generate_xre_rows())
    rows.extend(_generate_money_rows())

    # Optional: write market.json here for standalone testing.
    # generate_data.py will also write its own market.json.
    if rows:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        market_json_path = DATA_DIR / "market.json"
        market_json_path.write_text(
            json.dumps([asdict(r) for r in rows], indent=2),
            encoding="utf-8",
        )
        print(f"[Market] Wrote {len(rows)} rows to {market_json_path}")

    return rows
