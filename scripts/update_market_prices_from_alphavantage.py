# scripts/update_market_prices_from_twelvedata.py
# (Now using Alpha Vantage instead of Twelve Data)

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

# Where we store raw market JSON for the Market.py generator
ROOT_DIR = Path(__file__).resolve().parents[1]
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"

# Alpha Vantage endpoint
BASE_URL = "https://www.alphavantage.co/query"

# ---------------------------------------------------------------------------
# Symbols (Alpha Vantage format)
#
# Alpha Vantage's sample for TSX is SHOP.TRT. Per their support/StackOverflow
# you should use ".TRT" for Toronto (not .TO or .TSX).
#
# We'll use:
#   - XIU.TRT as a proxy for S&P/TSX Composite
#   - XRE.TRT as the REIT ETF
#
# You can override via env vars if needed:
#   ALPHAVANTAGE_TSX_SYMBOL
#   ALPHAVANTAGE_XRE_SYMBOL
# ---------------------------------------------------------------------------

TSX_INDEX_SYMBOL = os.getenv("ALPHAVANTAGE_TSX_SYMBOL", "XIU.TRT")
XRE_ETF_SYMBOL = os.getenv("ALPHAVANTAGE_XRE_SYMBOL", "XRE.TRT")


def fetch_monthly_series(symbol: str, api_key: str) -> Dict[str, Any]:
    """
    Fetch monthly OHLC time series for `symbol` from Alpha Vantage.

    Uses the TIME_SERIES_MONTHLY function, which returns:
      {
        "Meta Data": {...},
        "Monthly Time Series": {
            "2025-12-01": {
                "1. open": "...",
                "2. high": "...",
                "3. low": "...",
                "4. close": "...",
                "5. volume": "..."
            },
            ...
        }
      }
    """
    params = {
        "function": "TIME_SERIES_MONTHLY",
        "symbol": symbol,
        "apikey": api_key,
        "datatype": "json",
    }
    url = f"{BASE_URL}?{urlencode(params)}"
    print(f"[AlphaVantage] Requesting monthly series for {symbol}: {url}")

    try:
        with urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError) as e:
        print(f"[AlphaVantage] Error fetching monthly series for {symbol}: {e}")
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[AlphaVantage] JSON decode error for {symbol}: {e}")
        print(f"[AlphaVantage] Raw response (first 200 chars): {raw[:200]!r}")
        return {}

    # Handle common Alpha Vantage error formats
    if "Error Message" in data:
        print(f"[AlphaVantage] Error for {symbol}: {data['Error Message']}")
        return {}

    if "Note" in data:
        # Usually rate-limit or quota message
        print(f"[AlphaVantage] Note for {symbol}: {data['Note']}")
        return {}

    if "Information" in data:
        print(f"[AlphaVantage] Info for {symbol}: {data['Information']}")
        return {}

    ts_key = "Monthly Time Series"
    ts = data.get(ts_key)
    if not isinstance(ts, dict):
        print(
            f"[AlphaVantage] No '{ts_key}' key for {symbol}. "
            f"Top-level keys: {list(data.keys())}"
        )
        return {}

    # ts is a dict of { "YYYY-MM-DD": { "4. close": "..." } }
    return ts


def _parse_date(date_str: str) -> datetime:
    """Parse 'YYYY-MM-DD' from Alpha Vantage monthly series."""
    return datetime.strptime(date_str, "%Y-%m-%d")


def monthly_to_candles_payload(ts: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert Alpha Vantage 'Monthly Time Series' dict into a
    candles payload with 't' (timestamps) and 'c' (closes).

    This lets scripts/Market.py keep using its existing candle reader.
    """
    if not ts:
        return {}

    # Sorted oldest -> newest by date string
    items = sorted(ts.items(), key=lambda kv: kv[0])

    t_list: List[int] = []
    c_list: List[float] = []

    for date_str, row in items:
        if not isinstance(row, dict):
            continue

        close_str = row.get("4. close")
        if close_str is None:
            continue

        try:
            dt = _parse_date(date_str)
            close_val = float(close_str)
        except (ValueError, TypeError):
            continue

        t_list.append(int(dt.timestamp()))
        c_list.append(close_val)

    if not t_list or not c_list or len(t_list) != len(c_list):
        print(
            "[AlphaVantage] Warning: t/c conversion produced "
            f"{len(t_list)} timestamps and {len(c_list)} closes."
        )
        return {}

    return {
        "s": "ok",
        "t": t_list,
        "c": c_list,
    }


def main() -> None:
    api_key = os.getenv("ALPHAVANTAGE_API_KEY")
    if not api_key:
        raise SystemExit(
            "[AlphaVantage] ALPHAVANTAGE_API_KEY is not set. "
            "Set it in your environment (or Netlify env vars) before running."
        )

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # --- TSX Composite proxy (XIU.TRT) ---
    tsx_ts = fetch_monthly_series(TSX_INDEX_SYMBOL, api_key)
    tsx_payload = monthly_to_candles_payload(tsx_ts) if tsx_ts else {}
    if tsx_payload:
        tsx_path = RAW_DATA_DIR / "tsx_alphavantage.json"
        tsx_path.write_text(json.dumps(tsx_payload, indent=2), encoding="utf-8")
        print(
            f"[AlphaVantage] Wrote TSX proxy ETF ({TSX_INDEX_SYMBOL}) candles "
            f"to {tsx_path}"
        )
    else:
        print(
            f"[AlphaVantage] No TSX proxy ETF ({TSX_INDEX_SYMBOL}) data written."
        )

    # --- XRE REIT ETF (XRE.TRT) ---
    xre_ts = fetch_monthly_series(XRE_ETF_SYMBOL, api_key)
    xre_payload = monthly_to_candles_payload(xre_ts) if xre_ts else {}
    if xre_payload:
        xre_path = RAW_DATA_DIR / "xre_alphavantage.json"
        xre_path.write_text(json.dumps(xre_payload, indent=2), encoding="utf-8")
        print(
            f"[AlphaVantage] Wrote XRE ETF ({XRE_ETF_SYMBOL}) candles "
            f"to {xre_path}"
        )
    else:
        print(f"[AlphaVantage] No XRE ETF ({XRE_ETF_SYMBOL}) data written.")


if __name__ == "__main__":
    main()
