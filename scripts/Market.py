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

# ---- StatCan configuration ----

# Real GDP at basic prices, chain-linked, monthly, Canada, all industries.
# You've already set this to the correct vector ID.
GDP_VECTOR_ID = "v65201210"

# Money supply vectors from table 10-10-0116-01:
#  - M2 (gross)
#  - M2++ (gross)
M2_VECTOR_ID = "v41552796"
M2PP_VECTOR_ID = "v41552801"


def _statcan_wds_url(vector_ids: List[str]) -> str:
    """
    Build a StatCan Web Data Service URL for a list of vector IDs.

    We use the JSON format and request all available data for each vector.
    """
    base = "https://www150.statcan.gc.ca/t1/wds/en/grp/wds/grp?"
    # StatCan expects a JSON-like array string of vector IDs
    vecs = ",".join(vector_ids)
    return f"{base}vectorIds={vecs}"


def fetch_statcan_vectors(vector_ids: List[str]) -> Dict[str, Dict[str, float]]:
    """
    Fetch one or more StatCan vectors via WDS.

    Returns:
        {
          "v12345": {"YYYY-MM-01": value, ...},
          "v67890": {"YYYY-MM-01": value, ...},
        }
    """
    if not vector_ids:
        return {}

    url = _statcan_wds_url(vector_ids)

    req = urllib.request.Request(url, headers={"User-Agent": "housing-dashboard"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except (HTTPError, URLError) as e:
        print(f"[Market] StatCan WDS fetch failed: {e}")
        return {}

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[Market] Failed to decode StatCan WDS response: {e}")
        return {}

    result: Dict[str, Dict[str, float]] = {}
    # StatCan WDS returns a list of "object" items, each with a vectorId and points.
    for obj in payload.get("object", []):
        vec_id = obj.get("vectorId")
        if vec_id is None:
            continue
        vec_id_str = f"v{vec_id}"

        series: Dict[str, float] = {}
        for point in obj.get("points", []):
            ref_per = point.get("refPer")  # e.g. "2024-09-01"
            value_str = point.get("value")
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

    Expects raw JSON saved from stock/candle endpoint.
    """
    if not json_path.exists():
        print(f"[Market] Warning: missing Finnhub raw file for {label}: {json_path}")
        return {}

    try:
        raw = json.loads(json_path.read_text())
    except json.JSONDecodeError as e:
        print(f"[Market] Failed to parse {label} Finnhub JSON: {e}")
        return {}

    t = raw.get("t") or []
    c = raw.get("c") or []

    if not isinstance(t, list) or not isinstance(c, list) or len(t) != len(c):
        print(f"[Market] Unexpected Finnhub structure in {json_path}")
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


def _build_panel_rows_for_series(
    metric_id: str,
    unit: str,
    source: str,
    series: Dict[str, float],
) -> List[PanelRow]:
    """
    Turn a date->value series into PanelRow list with MoM, YoY, MA3.
    """
    if not series:
        return []

    # Sorted by date ascending
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
    # Convert from millions of chained dollars to plain dollars (x 1,000,000).
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

    # Convert from millions of dollars to dollars (x 1,000,000).
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
    tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"
    tsx_series = _read_finnhub_candles(tsx_path, "TSX Composite")

    return _build_panel_rows_for_series(
        metric_id="tsx_composite_index",
        unit="index",
        source="finnhub_tsx_composite",
        series=tsx_series,
    )


def _generate_xre_rows() -> List[PanelRow]:
    xre_path = RAW_DATA_DIR / "xre_finnhub.json"
    xre_series_raw = _read_finnhub_candles(xre_path, "XRE ETF")

    # Normalize to an index (base = first close = 100.0)
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
        source="finnhub_xre",
        series=index_series,
    )


def generate_market() -> List[PanelRow]:
    """
    Main entry point: generate all PanelRow records for the Market tab.

    Metrics:
      - ca_real_gdp         (StatCan 36-10-0434-01)
      - tsx_composite_index (Finnhub)
      - xre_price_index     (Finnhub, normalized to 100 at first obs)
      - ca_m2               (StatCan 10-10-0116-01, v41552796)
      - ca_m2pp             (StatCan 10-10-0116-01, v41552801)
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
