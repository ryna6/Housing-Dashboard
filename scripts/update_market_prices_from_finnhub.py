# scripts/update_market_prices_from_finnhub.py
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

# Finnhub quote endpoint (NOT candles)
FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote"

# Adjust these if your Finnhub symbols are different.
# For TSX stocks/indices Finnhub usually uses ".TO" suffix or an index code.
TSX_INDEX_SYMBOL = "^GSPTSE"  # verify this symbol in your other project
XRE_ETF_SYMBOL = "XRE.TO"     # iShares S&P/TSX Capped REIT Index

def fetch_quote(symbol: str, api_key: str) -> dict:
    """
    Fetch latest quote for a symbol from Finnhub /quote.
    Returns a dict with keys like c, h, l, o, pc, t.
    """
    params = {
        "symbol": symbol,
        "token": api_key,
    }
    url = f"{FINNHUB_QUOTE_URL}?{urlencode(params)}"
    print(f"[Finnhub] Requesting quote for {symbol}: {url}")

    try:
        with urlopen(url, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError) as e:
        print(f"[Finnhub] Error fetching quote for {symbol}: {e}")
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[Finnhub] JSON decode error for {symbol}: {e}")
        print(f"[Finnhub] Raw response for {symbol} (first 200 chars): {raw[:200]!r}")
        return {}

    # If the response clearly isn’t a quote object, bail out.
    if not isinstance(data, dict) or "c" not in data:
        print(f"[Finnhub] Unexpected quote payload for {symbol}: {data!r}")
        return {}

    return data


def quote_to_candles_payload(quote: dict) -> dict:
    """
    Convert a single quote object to a "candles" style payload compatible
    with Market.py's _read_finnhub_candles (expects t[] and c[]).
    """
    c = quote.get("c")
    t = quote.get("t")
    if c is None:
        return {}

    # Build a minimal candles-style payload with arrays.
    return {
        "s": "ok",
        "t": [t] if t is not None else [],
        "c": [c],
        # Optional extras (not strictly needed by Market.py)
        "o": [quote.get("o")] if quote.get("o") is not None else [],
        "h": [quote.get("h")] if quote.get("h") is not None else [],
        "l": [quote.get("l")] if quote.get("l") is not None else [],
        "pc": quote.get("pc"),
    }


def main() -> None:
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise SystemExit(
            "[Finnhub] FINNHUB_API_KEY is not set. "
            "Set it in your environment (Netlify env vars or local shell) before running."
        )

    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # TSX Composite index
    tsx_quote = fetch_quote(TSX_INDEX_SYMBOL, api_key)
    tsx_payload = quote_to_candles_payload(tsx_quote)
    if tsx_payload:
        tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"
        tsx_path.write_text(json.dumps(tsx_payload, indent=2), encoding="utf-8")
        print(f"[Finnhub] Wrote TSX Composite quote-as-candles to {tsx_path}")
    else:
        print("[Finnhub] No TSX quote data to write.")

    # XRE ETF
    xre_quote = fetch_quote(XRE_ETF_SYMBOL, api_key)
    xre_payload = quote_to_candles_payload(xre_quote)
    if xre_payload:
        xre_path = RAW_DATA_DIR / "xre_finnhub.json"
        xre_path.write_text(json.dumps(xre_payload, indent=2), encoding="utf-8")
        print(f"[Finnhub] Wrote XRE ETF quote-as-candles to {xre_path}")
    else:
        print("[Finnhub] No XRE quote data to write.")


if __name__ == "__main__":
    main()
