# scripts/update_market_prices_from_finnhub.py
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

# Correct candles endpoint
FINNHUB_BASE_URL = "https://finnhub.io/api/v1/stock/candle"
FINNHUB_RESOLUTION = "D"  # daily bars
DEFAULT_YEARS = 12        # ~12 years of history is enough for 10y charts

# Adjust these if your Finnhub account uses different symbols.
# For TSX stocks, Finnhub typically uses ".TO" suffix.
TSX_INDEX_SYMBOL = "^GSPTSE"  # S&P/TSX Composite index (verify via /stock/symbol if needed)
XRE_ETF_SYMBOL = "XRE.TO"     # iShares S&P/TSX Capped REIT Index ETF on TSX


def fetch_daily_history(symbol: str, api_key: str, years: int = DEFAULT_YEARS) -> dict:
    """
    Fetch up to `years` years of daily history for a symbol from Finnhub.

    We use the stock/candle endpoint with resolution=D, and the backend
    (scripts/Market.py) will bucket these daily closes into monthly values
    by month.
    """
    now = int(time.time())
    start = now - years * 365 * 24 * 60 * 60  # rough N-year window

    params = {
        "symbol": symbol,
        "resolution": FINNHUB_RESOLUTION,
        "from": start,
        "to": now,
        "token": api_key,
    }
    url = f"{FINNHUB_BASE_URL}?{urlencode(params)}"
    print(f"[Finnhub] Requesting daily candles for {symbol}: {url}")

    try:
        with urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError) as e:
        print(f"[Finnhub] Error fetching candles for {symbol}: {e}")
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[Finnhub] JSON decode error for {symbol}: {e}")
        print(f"[Finnhub] Raw response for {symbol} (first 200 chars): {raw[:200]!r}")
        return {}

    status = data.get("s")
    if status != "ok":
        # Finnhub returns s="no_data" if the symbol is wrong or no history.
        print(f"[Finnhub] Warning: candle status for {symbol} is {status}")
    else:
        print(
            f"[Finnhub] Got {len(data.get('t') or [])} daily candles for {symbol} "
            f"(resolution={FINNHUB_RESOLUTION})"
        )

    return data


def main() -> None:
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise SystemExit(
            "[Finnhub] FINNHUB_API_KEY is not set. "
            "Set it in your environment (or Netlify env vars) before running."
        )

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # TSX Composite index
    tsx_data = fetch_daily_history(TSX_INDEX_SYMBOL, api_key)
    if tsx_data:
        tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"
        tsx_path.write_text(json.dumps(tsx_data, indent=2), encoding="utf-8")
        print(f"[Finnhub] Wrote TSX Composite daily candles to {tsx_path}")

    # XRE ETF
    xre_data = fetch_daily_history(XRE_ETF_SYMBOL, api_key)
    if xre_data:
        xre_path = RAW_DATA_DIR / "xre_finnhub.json"
        xre_path.write_text(json.dumps(xre_data, indent=2), encoding="utf-8")
        print(f"[Finnhub] Wrote XRE ETF daily candles to {xre_path}")


if __name__ == "__main__":
    main()
