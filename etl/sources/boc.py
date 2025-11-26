import requests
import pandas as pd
from datetime import date
from typing import List

BASE_URL = "https://www.bankofcanada.ca/valet/observations"

def fetch_boc_series(
    series_ids: List[str],
    start: str = "2000-01-01",
    end: str | None = None,
) -> pd.DataFrame:
    """
    Fetch BoC Valet series as wide monthly DataFrame.
    series_ids: e.g. ["V39079", "V39051", "V39053", "V39055"]
    """
    if end is None:
        end = date.today().isoformat()
    series_path = ",".join(series_ids)
    url = f"{BASE_URL}/{series_path}/json?start_date={start}&end_date={end}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    obs = data["observations"]
    rows = []
    for o in obs:
        row = {"date": o["d"]}
        for sid in series_ids:
            val = o.get(sid, {}).get("v")
            row[sid] = float(val) if val is not None else None
        rows.append(row)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    # collapse to month-end average if daily
    df = (
        df.set_index("date")
          .resample("M")
          .mean()
          .reset_index()
    )
    return df

