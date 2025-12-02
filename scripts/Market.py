# scripts/Market.py
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import urllib.request
from urllib.error import HTTPError, URLError

# -------------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

# -------------------------------------------------------------------------
# Core row model (same shape as other tabs)
# -------------------------------------------------------------------------


@dataclass
class PanelRow:
    date: str          # YYYY-MM-01
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


# -------------------------------------------------------------------------
# StatCan WDS configuration (shared pattern with other tabs)
# -------------------------------------------------------------------------

STATCAN_WDS_URL = (
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods"
)

# Real GDP at basic prices, chain-linked, monthly, Canada, all industries.
GDP_VECTOR_ID = "v65201210"

# Money supply vectors from table 10-10-0116-01 (monthly, millions of dollars)
M2_VECTOR_ID = "v41552796"   # M2 (gross)
M2PP_VECTOR_ID = "v41552801" # M2++ (gross)


def _statcan_vector_id_to_int(vector_id: str) -> int:
    """
    Convert a vector id like 'v41552796' or 'V41552796' to the integer 41552796.
    """
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

    Returns a mapping:
        {
          "v12345": {"YYYY-MM-01": value, ...},
          "v67890": {"YYYY-MM-01": value, ...},
        }

    Values are *as returned by WDS*; you can apply your own scaling (e.g. millions → dollars)
    in the caller.
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
            "User-Agent": "housing-dashboard",
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
    except json.JSONDecodeError as e:
        print(f"[Market] StatCan WDS JSON decode failed: {e}")
        return {}

    result: Dict[str, Dict[str, float]] = {}

    # Expected shape (see WDS user guide):
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


# -------------------------------------------------------------------------
# Twelve Data raw data readers (no API calls here)
# -------------------------------------------------------------------------


def _read_twelvedata_candles(json_path: Path, label: str) -> Dict[str, float]:
    """
    Read market candles (t, c arrays) created by the Twelve Data updater script
    and return a monthly close series:
        { "YYYY-MM-01": close_price, ... }

    Expects raw JSON saved by scripts/update_market_prices_from_twelvedata.py
    in a Finnhub-compatible "candles" shape (keys: t, c, ...).
    """
    if not json_path.exists():
        print(f"[Market] Warning: missing Twelve Data raw file for {label}: {json_path}")
        return {}

    try:
        raw = json.loads(json_path.read_text())
    except json.JSONDecodeError as e:
        print(f"[Market] Failed to parse {label} Twelve Data JSON: {e}")
        return {}

    t = raw.get("t") or []
    c = raw.get("c") or []

    if not isinstance(t, list) or not isinstance(c, list) or len(t) != len(c):
        print(f"[Market] Unexpected Twelve Data structure in {json_path}")
        return {}

    series: Dict[str, float] = {}
    for ts, close in zip(t, c):
        try:
            ts_int = int(ts)
            close_val = float(close)
        except (TypeError, ValueError):
            continue

        dt = datetime.utcfromtimestamp(ts_int)
        date_str = dt.strftime("%Y-%m-01")
        series[date_str] = close_val

    return series


# -------------------------------------------------------------------------
# Shared helper to turn a date->value series into PanelRow list
# -------------------------------------------------------------------------


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
                region="canada",
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


# -------------------------------------------------------------------------
# Metric-specific generators
# -------------------------------------------------------------------------


def _generate_gdp_rows() -> List[PanelRow]:
    """
    Canada real GDP, monthly, all industries, chained 2017 dollars.
    """
    if GDP_VECTOR_ID.startswith("vX") or GDP_VECTOR_ID.startswith("vx"):
        print(
            "[Market] GDP_VECTOR_ID is still a placeholder. "
            "Set it to the correct StatCan vector for Canada / all industries / "
            "real chained (2017) dollars in table 36-10-0434-01."
        )
        return []

    statcan_data = fetch_statcan_vectors([GDP_VECTOR_ID], latest_n=600)
    gdp_series = statcan_data.get(GDP_VECTOR_ID, {})

    # Convert from millions of chained dollars to plain dollars (x 1,000,000)
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
    TSX Composite index, monthly closes from Twelve Data candles.
    """
    tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"  # written by Twelve Data updater
    tsx_series = _read_twelvedata_candles(tsx_path, "TSX Composite")

    return _build_panel_rows_for_series(
        metric_id="tsx_composite_index",
        unit="index",
        source="twelvedata_tsx_composite",
        series=tsx_series,
    )


def _generate_xre_rows() -> List[PanelRow]:
    """
    XRE ETF index, monthly closes from Twelve Data candles,
    normalized to 100 at the first available month.
    """
    xre_path = RAW_DATA_DIR / "xre_finnhub.json"  # written by Twelve Data updater
    xre_series_raw = _read_twelvedata_candles(xre_path, "XRE ETF")

    if not xre_series_raw:
        return []

    items = sorted(xre_series_raw.items(), key=lambda kv: kv[0])
    if not items:
        return []

    base_close = items[0][1]
    if base_close == 0:
        return []

    index_series: Dict[str, float] = {
        d: (v / base_close) * 100.0 for (d, v) in items
    }

    return _build_panel_rows_for_series(
        metric_id="xre_price_index",
        unit="index",
        source="twelvedata_xre_etf",
        series=index_series,
    )


# -------------------------------------------------------------------------
# Public entrypoint
# -------------------------------------------------------------------------


def generate_market() -> List[PanelRow]:
    """
    Main entry point: generate all PanelRow records for the Market tab.

    Metrics:
      - ca_real_gdp         (StatCan 36-10-0434-01 via WDS)
      - tsx_composite_index (Twelve Data raw JSON → candles → monthly index)
      - xre_price_index     (Twelve Data raw JSON → candles → index normalized to 100)
      - ca_m2               (StatCan 10-10-0116-01, v41552796)
      - ca_m2pp             (StatCan 10-10-0116-01, v41552801)
    """
    rows: List[PanelRow] = []
    rows.extend(_generate_gdp_rows())
    rows.extend(_generate_tsx_rows())
    rows.extend(_generate_xre_rows())
    rows.extend(_generate_money_rows())

    # This write is redundant with scripts/generate_data.py but makes
    # the module testable standalone.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    market_json_path = DATA_DIR / "market.json"
    market_json_path.write_text(
        json.dumps([asdict(r) for r in rows], indent=2),
        encoding="utf-8",
    )
    print(f"[Market] Wrote {len(rows)} rows to {market_json_path}")

    return rows
