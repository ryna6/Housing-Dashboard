import requests
import pandas as pd
from typing import Sequence

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/en/grp/wds"

def fetch_statcan_vectors(
    vector_ids: Sequence[int],
    start_ref: str = "2000-01-01",
    end_ref: str | None = None,
) -> pd.DataFrame:
    """
    Pull full history for specific vectors over a refPeriod range.
    You’ll pre-configure vector_ids for:
      - CPI all-items (Canada, ON, BC)
      - Unemployment rate (Canada, ON, BC), etc.
    """
    if end_ref is None:
        # just use a far future; StatCan will cap
        end_ref = "2100-01-01"

    url = (
        "https://www150.statcan.gc.ca/t1/wds/en/grp/"
        "getDataFromVectorByReferencePeriodRange"
    )
    params = {
        "vectorIds": ",".join(str(v) for v in vector_ids),
        "startRefPeriod": start_ref,
        "endRefPeriod": end_ref,
    }
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    # payload["object"] contains data for each vector
    series_frames = []
    for obj in payload["object"]["vectorDataPoint"]:
        # In practice you’ll iterate over each vector; keeping this high-level
        pass

    # For brevity, I’d actually recommend:
    # - Use getFullTableDownloadCSV for the specific table and filter by geography/series in pandas. :contentReference[oaicite:16]{index=16}
    raise NotImplementedError("Fill in based on chosen tables.")

