# scripts/update_market_prices_from_twelvedata.py
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
RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

# Twelve Data time series endpoint
BASE_URL = "https://api.twelvedata.com/time_series"
DEFAULT_OUTPUTSIZE = 180  # ~15 years of monthly data

# Symbols:
# - Set these explicitly in Netlify env vars if you know the exact Twelve Data symbols.
# - Or hardcode them once you've confirmed via Twelve Data's request builder / symbol search.
#
# Example possible formats (you will need to confirm):
#   - S&P/TSX Composite index: "^GSPTSE" or "GSPTSE"
#   - XRE ETF: "XRE:XTSE" or "XRE.TO"
#
# For now we let you override via env vars:
TSX_INDEX_SYMBOL = os.getenv("TWELVEDATA_TSX_SYMBOL", "^GSPTSE")
XRE_ETF_SYMBOL = os.getenv("TWELVEDATA_XRE_SYMBOL", "XRE")


def fetch_time_series(
    symbol: str,
    api_key: str,
    interval: str = "1month",
    outputsize: int = DEFAULT_OUTPUTSIZE,
) -> Dict[str, Any]:
    """
    Fetch a time series from Twelve Data for the given symbol.

    We request monthly candles to get a compact history that we can
    feed into the Market.py generator.
    """
    params = {
        "symbol": symbol,
        "interval": interval,
        "outputsize": outputsize,
        "apikey": api_key,
    }
    url = f"{BASE_URL}?{urlencode(params)}"
    print(f"[TwelveData] Requesting time series for {symbol}: {url}")

    try:
        with urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError) as e:
        print(f"[TwelveData] Error fetching time series for {symbol}: {e}")
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[TwelveData] JSON decode error for {symbol}: {e}")
        print(f"[TwelveData] Raw response (first 200 chars): {raw[:200]!r}")
        return {}

    # Twelve Data typically returns:
    # { "meta": {...}, "values": [ {...}, ... ], "status": "ok" }
    status = data.get("status")
    if status and status != "ok":
        print(
            f"[TwelveData] API status for {symbol} is {status}. "
            f"Message: {data.get('message') or data.get('note')}"
        )
        return {}

    values = data.get("values")
    if not isinstance(values, list) or not values:
        print(f"[TwelveData] No 'values' array for {symbol}: {data!r}")
        return {}

    return data


def _parse_datetime(dt_str: str) -> datetime:
    """
    Robust-ish ISO/datetime parser for Twelve Data 'datetime' fields.

    Handles:
      - 'YYYY-MM-DD'
      - 'YYYY-MM-DD HH:MM:SS'
      - 'YYYY-MM-DDTHH:MM:SS'
    """
    s = dt_str.strip()
    if " " in s and "T" not in s:
        s = s.replace(" ", "T")
    # Strip trailing 'Z' if present
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        # Fallback: just take the date part
        return datetime.strptime(s[:10], "%Y-%m-%d")


def values_to_candles_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert Twelve Data's 'values' array into a Finnhub-style
    candles payload with 't' (timestamps) and 'c' (closes).

    This lets Market.py keep using its existing _read_finnhub_candles
    logic without any changes.
    """
    values = data.get("values", [])
    if not values:
        return {}

    # Sort oldest -> newest by datetime
    sorted_vals = sorted(values, key=lambda row: _parse_datetime(row["datetime"]))

    t_list: List[int] = []
    c_list: List[float] = []

    for row in sorted_vals:
        dt_str = row.get("datetime")
        close_str = row.get("close")
        if not dt_str or close_str is None:
            continue

        try:
            dt = _parse_datetime(dt_str)
            close_val = float(close_str)
        except (ValueError, TypeError):
            continue

        t_list.append(int(dt.timestamp()))
        c_list.append(close_val)

    if not t_list or not c_list or len(t_list) != len(c_list):
        print(
            "[TwelveData] Warning: t/c conversion produced "
            f"{len(t_list)} timestamps and {len(c_list)} closes."
        )
        return {}

    return {
        "s": "ok",
        "t": t_list,
        "c": c_list,
    }


def main() -> None:
    api_key = os.getenv("TWELVEDATA_API_KEY")
    if not api_key:
        raise SystemExit(
            "[TwelveData] TWELVEDATA_API_KEY is not set. "
            "Set it in your environment (or Netlify env vars) before running."
        )

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # --- TSX Composite index ---
    tsx_raw = fetch_time_series(TSX_INDEX_SYMBOL, api_key)
    tsx_payload = values_to_candles_payload(tsx_raw) if tsx_raw else {}
    if tsx_payload:
        tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"
        tsx_path.write_text(json.dumps(tsx_payload, indent=2), encoding="utf-8")
        print(f"[TwelveData] Wrote TSX Composite candles to {tsx_path}")
    else:
        print("[TwelveData] No TSX Composite data written.")

    # --- XRE ETF ---
    xre_raw = fetch_time_series(XRE_ETF_SYMBOL, api_key)
    xre_payload = values_to_candles_payload(xre_raw) if xre_raw else {}
    if xre_payload:
        xre_path = RAW_DATA_DIR / "xre_finnhub.json"
        xre_path.write_text(json.dumps(xre_payload, indent=2), encoding="utf-8")
        print(f"[TwelveData] Wrote XRE ETF candles to {xre_path}")
    else:
        print("[TwelveData] No XRE ETF data written.")


if __name__ == "__main__":
    main()
