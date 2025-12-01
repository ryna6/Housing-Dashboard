# scripts/update_market_prices_from_finnhub.py
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

RAW_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"

FINNHUB_BASE_URL = "https://finnhub.io/api/v1/stock/candle"
FINNHUB_RESOLUTION = "M"
FINNHUB_COUNT = 500  # last ~40 years of monthly data

# Tickers are *not* secrets, so we can hard-code them.
# Adjust these if your Finnhub symbol mapping differs.
TSX_INDEX_SYMBOL = "^GSPTSE"
XRE_ETF_SYMBOL = "XRE.TO"


def fetch_candles(symbol: str, api_key: str) -> dict:
  """
  Fetch monthly candles for a symbol from Finnhub.

  Uses the `stock/candle` endpoint with resolution=M.
  """
  params = {
      "symbol": symbol,
      "resolution": FINNHUB_RESOLUTION,
      "count": FINNHUB_COUNT,
      "token": api_key,
  }
  url = f"{FINNHUB_BASE_URL}?{urlencode(params)}"
  print(f"[Finnhub] Requesting {symbol} candles")

  try:
      with urlopen(url, timeout=30) as resp:
          raw = resp.read().decode("utf-8")
  except (HTTPError, URLError) as e:
      raise RuntimeError(f"Finnhub request for {symbol} failed: {e}") from e

  data = json.loads(raw)
  status = data.get("s")
  if status not in ("ok", "no_data"):
      raise RuntimeError(
          f"Finnhub returned non-ok status for {symbol}: {status}, body={data}"
      )
  return data


def main() -> None:
  api_key = os.getenv("FINNHUB_API_KEY")
  if not api_key:
      raise SystemExit(
          "[Finnhub] FINNHUB_API_KEY environment variable is not set. "
          "Export your API key and re-run this script."
      )

  RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)

  tsx_data = fetch_candles(TSX_INDEX_SYMBOL, api_key)
  tsx_path = RAW_DATA_DIR / "tsx_finnhub.json"
  tsx_path.write_text(json.dumps(tsx_data, indent=2), encoding="utf-8")
  print(f"[Finnhub] Wrote TSX Composite candles to {tsx_path}")

  xre_data = fetch_candles(XRE_ETF_SYMBOL, api_key)
  xre_path = RAW_DATA_DIR / "xre_finnhub.json"
  xre_path.write_text(json.dumps(xre_data, indent=2), encoding="utf-8")
  print(f"[Finnhub] Wrote XRE ETF candles to {xre_path}")


if __name__ == "__main__":
  main()
