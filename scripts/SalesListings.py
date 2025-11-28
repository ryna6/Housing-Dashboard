from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"

# Statistics Canada Web Data Service base URL
WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


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


def compute_changes(
    values: List[float],
) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
    """
    Compute:
    - month-over-month % change
    - year-over-year % change
    - 3-month trailing moving average (level)
    """
    n = len(values)
    mom: List[Optional[float]] = [None] * n
    yoy: List[Optional[float]] = [None] * n
    ma3: List[float] = [0.0] * n

    for i, v in enumerate(values):
        window = values[max(0, i - 2) : i + 1]
        ma3[i] = sum(window) / len(window)

        if i > 0 and values[i - 1] != 0:
            mom[i] = (v / values[i - 1] - 1.0) * 100.0

        if i >= 12 and values[i - 12] != 0:
            yoy[i] = (v / values[i - 12] - 1.0) * 100.0

    return mom, yoy, ma3


# ---------------------------------------------------------------------------
# CREA helpers – quarterly to monthly
# ---------------------------------------------------------------------------


def _parse_quarter_label(label: str) -> Tuple[int, int]:
    """
    Parse labels like '2020-Q1' / '2020 Q1' / '2020Q1' into (year, quarter).
    """
    s = str(label).strip()
    if not s:
        raise ValueError("Empty quarter label")

    # Handle common formats
    # e.g. '2020-Q1', '2020 Q1', '2020Q1'
    year_part = s[:4]
    try:
        year = int(year_part)
    except ValueError as exc:
        raise ValueError(f"Unexpected quarter label format: {label!r}") from exc

    # Find 'Q'
    q_index = s.upper().find("Q")
    if q_index == -1 or q_index + 1 >= len(s):
        raise ValueError(f"Unexpected quarter label format (no Q): {label!r}")

    try:
        quarter = int(s[q_index + 1])
    except ValueError as exc:
        raise ValueError(f"Unexpected quarter number in label: {label!r}") from exc

    if quarter not in (1, 2, 3, 4):
        raise ValueError(f"Quarter must be 1–4, got {quarter} for label {label!r}")

    return year, quarter


def _quarter_months(year: int, quarter: int) -> List[date]:
    """Return the three calendar months corresponding to a given quarter."""
    start_month = (quarter - 1) * 3 + 1
    return [date(year, start_month + i, 1) for i in range(3)]


def _build_monthly_from_crea_quarterly(df: pd.DataFrame) -> Dict[str, float]:
    """
    Take a CREA quarterly dataframe with columns ['Date', 'Canada'] and
    convert it to a monthly series by spreading each quarter's total evenly
    across its three months.

    The CREA workbook also sometimes appends a single monthly observation
    (e.g. '2025-10-01') – those are treated as already-monthly values.
    """
    monthly: Dict[str, float] = {}

    for _, row in df.iterrows():
        val = row.get("Canada")
        if pd.isna(val):
            continue

        raw_date = row.get("Date")

        # If this is already a datetime-like object, treat as monthly.
        if isinstance(raw_date, (datetime, pd.Timestamp)):
            d = raw_date.date()
            key = date(d.year, d.month, 1).isoformat()
            monthly[key] = float(val)
            continue

        # Fallback to string parsing
        s = str(raw_date).strip()
        if not s or s.lower() == "nan":
            continue

        # Quarterly label like "2020-Q1"
        try:
            year, quarter = _parse_quarter_label(s)
        except ValueError:
            # Try to parse as a regular date string
            try:
                d = pd.to_datetime(s).date()
            except Exception:
                continue
            key = date(d.year, d.month, 1).isoformat()
            monthly[key] = float(val)
            continue

        per_month = float(val) / 3.0
        for d in _quarter_months(year, quarter):
            key = d.isoformat()
            monthly[key] = per_month

    return monthly


# ---------------------------------------------------------------------------
# StatCan helpers – absorption / unabsorbed inventory
# ---------------------------------------------------------------------------


def fetch_statcan_absorption_components() -> Dict[str, Dict[str, float]]:
    """
    Fetch absorption and unabsorbed inventory for Canada-level housing
    from Statistics Canada table 34-10-0149-01 via the Web Data Service.

    We target the series with:
      - Geography: Canada (if available) OR "Census metropolitan areas"
      - Completed dwelling units: "Absorptions" and "Unabsorbed inventory"
      - Type of dwelling unit: "Total units"

    Implementation notes:
      * We first call getCubeMetadata to discover member IDs for the
        dimensions above.
      * We then build coordinates for the two series of interest and
        call getDataFromCubePidCoordAndLatestNPeriods to pull all
        available monthly data.
      * The structure of the response and the parsing of refPer /
        symbolCode mirror the patterns used in InflationLabour.py.
    """
    product_id = 3410014901  # PID for table 34-10-0149-01

    meta_url = f"{WDS_BASE}/getCubeMetadata"
    payload = [{"productId": product_id}]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        meta_url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.load(resp)
    except (HTTPError, URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] StatCan absorption metadata fetch failed: {e}")
        return {}

    if not isinstance(res, list) or not res or res[0].get("status") != "SUCCESS":
        print("[WARN] Unexpected StatCan WDS metadata response for 34-10-0149-01")
        return {}

    meta_obj = res[0].get("object") or {}
    dims = meta_obj.get("dimension") or []

    def find_dim(name_substring: str) -> Optional[Dict]:
        for d in dims:
            name = (d.get("dimensionNameEn") or "").lower()
            if name_substring.lower() in name:
                return d
        return None

    geo_dim = find_dim("geography")
    completed_dim = find_dim("completed dwelling units")
    type_dim = find_dim("type of dwelling unit")

    if not geo_dim or not completed_dim or not type_dim:
        print("[WARN] Could not find expected dimensions in 34-10-0149-01 metadata")
        return {}

    def find_member_id(dim: Dict, candidates: List[str]) -> Optional[int]:
        members = dim.get("member") or []
        for cand in candidates:
            for m in members:
                if (m.get("memberNameEn") or "").strip().lower() == cand.lower():
                    return int(m.get("memberId"))
        return None

    # Geography: prefer "Canada", fallback to "Census metropolitan areas"
    geo_member_id = find_member_id(geo_dim, ["Canada", "Census metropolitan areas"])
    # Completed dwelling units: "Absorptions" and "Unabsorbed inventory"
    comp_abs_id = find_member_id(completed_dim, ["Absorptions"])
    comp_unabs_id = find_member_id(completed_dim, ["Unabsorbed inventory"])
    # Type of dwelling unit: "Total units"
    type_total_id = find_member_id(type_dim, ["Total units"])

    if None in (geo_member_id, comp_abs_id, comp_unabs_id, type_total_id):
        print(
            "[WARN] Missing one or more required members for geography / "
            "completed units / dwelling type in 34-10-0149-01"
        )
        return {}

    # Build coordinates in dimensionPositionId order
    dims_sorted = sorted(dims, key=lambda d: d.get("dimensionPositionId") or 0)

    def build_coord(completed_member_id: int) -> str:
        coord_parts: List[str] = []
        for d in dims_sorted:
            name = (d.get("dimensionNameEn") or "").lower()
            if "geography" in name:
                coord_parts.append(str(geo_member_id))
            elif "completed dwelling units" in name:
                coord_parts.append(str(completed_member_id))
            elif "type of dwelling unit" in name:
                coord_parts.append(str(type_total_id))
            else:
                # Fallback to first member for any unexpected dimension
                members = d.get("member") or []
                if members:
                    coord_parts.append(str(int(members[0].get("memberId"))))
                else:
                    coord_parts.append("0")
        return ".".join(coord_parts)

    coord_abs = build_coord(comp_abs_id)
    coord_unabs = build_coord(comp_unabs_id)

    data_url = f"{WDS_BASE}/getDataFromCubePidCoordAndLatestNPeriods"
    payload = [
        {"productId": product_id, "coordinate": coord_abs, "latestN": 2000},
        {"productId": product_id, "coordinate": coord_unabs, "latestN": 2000},
    ]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        data_url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.load(resp)
    except (HTTPError, URLError, TimeoutError, ValueError) as e:
        print(f"[WARN] StatCan absorption data fetch failed: {e}")
        return {}

    if not isinstance(res, list):
        print("[WARN] Unexpected StatCan WDS data response for 34-10-0149-01")
        return {}

    series: Dict[str, Dict[str, float]] = {
        "absorption": {},
        "unabsorbed_inventory": {},
    }

    # We sent payload in order: [absorption, unabsorbed]; map by index.
    for idx, entry in enumerate(res):
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}
        datapoints = obj.get("vectorDataPoint") or []

        metric_key = "absorption" if idx == 0 else "unabsorbed_inventory"

        for dp in datapoints:
            value = dp.get("value")
            symbol = dp.get("symbolCode")

            if value in (None, "", "NaN"):
                continue
            # Keep only "normal" values: symbol 0 or missing
            if symbol not in (0, None):
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue

            # Standardize YYYY-MM → YYYY-MM-01
            if len(ref) == 7:
                ref = ref + "-01"
            try:
                d = datetime.fromisoformat(ref[:10]).date()
            except Exception:
                continue

            key = date(d.year, d.month, 1).isoformat()
            series[metric_key][key] = v

    print(
        f"[INFO] StatCan absorption points loaded: "
        f"{len(series['absorption'])} absorption, "
        f"{len(series['unabsorbed_inventory'])} unabsorbed"
    )
    return series


# ---------------------------------------------------------------------------
# Main ETL for Sales & Listings tab
# ---------------------------------------------------------------------------


def generate_sales() -> List[PanelRow]:
    """
    Generate sales / listings panel rows for the Sales tab.

    Metrics produced (Canada aggregate only, segment='all'):
      - new_listings      (level, count)
      - active_listings   (level, count, derived = MOI * sales)
      - snlr              (Sales-to-new-listings ratio, %, CREA)
      - moi               (Months of inventory, months, CREA)
      - absorption_rate   (%, StatCan – derived from absorptions vs unabsorbed)
    """
    rows: List[PanelRow] = []

    # ---------------- CREA: sales + new listings (quarterly → monthly) --------------
    crea_path = RAW_DATA_DIR / "SA Sales & Listings Canada.xlsx"
    if not crea_path.exists():
        raise FileNotFoundError(f"Missing CREA Sales & Listings workbook at {crea_path}")

    xls = pd.ExcelFile(crea_path)

    # Chart 1 – residential sales activity (quarterly)
    if "Chart 1" not in xls.sheet_names:
        raise ValueError("Expected 'Chart 1' sheet in CREA Sales workbook")
    df_sales_q = pd.read_excel(crea_path, sheet_name="Chart 1", usecols=["Date", "Canada"])
    df_sales_q = df_sales_q[df_sales_q["Canada"].notna()].copy()
    sales_monthly: Dict[str, float] = _build_monthly_from_crea_quarterly(df_sales_q)

    # Chart 2 – residential new listings (quarterly)
    if "Chart 2" not in xls.sheet_names:
        raise ValueError("Expected 'Chart 2' sheet in CREA Sales workbook")
    df_new_q = pd.read_excel(crea_path, sheet_name="Chart 2", usecols=["Date", "Canada"])
    df_new_q = df_new_q[df_new_q["Canada"].notna()].copy()
    new_listings_monthly: Dict[str, float] = _build_monthly_from_crea_quarterly(df_new_q)

    # ---------------- CREA: MOI + SNLR (monthly) ------------------------------------
    if "Chart 3" not in xls.sheet_names:
        raise ValueError("Expected 'Chart 3' sheet in CREA Sales workbook")
    df_moi = pd.read_excel(
        crea_path,
        sheet_name="Chart 3",
        usecols=["Date", "Months of inventory (L)", "Sales to new listings ratio (R)"],
    )
    df_moi = df_moi.dropna(subset=["Months of inventory (L)", "Sales to new listings ratio (R)"]).copy()
    df_moi["Date"] = pd.to_datetime(df_moi["Date"]).dt.date
    df_moi = df_moi.sort_values("Date")

    moi_monthly: Dict[str, float] = {}
    snlr_monthly: Dict[str, float] = {}
    for _, row in df_moi.iterrows():
        d = row["Date"]
        key = date(d.year, d.month, 1).isoformat()
        moi_monthly[key] = float(row["Months of inventory (L)"])
        snlr_monthly[key] = float(row["Sales to new listings ratio (R)"])

    # ---------------- Derived: active listings (monthly) ----------------------------
    active_listings_monthly: Dict[str, float] = {}
    for dt, sales_val in sales_monthly.items():
        moi_val = moi_monthly.get(dt)
        if moi_val is None:
            continue
        active_listings_monthly[dt] = moi_val * sales_val

    # ---------------- StatCan: absorption rate -------------------------------------
    absorption_rate_monthly: Dict[str, float] = {}
    try:
        statcan_series = fetch_statcan_absorption_components()
    except Exception as e:
        print(f"[WARN] StatCan absorption fetch raised unexpected error: {e}")
        statcan_series = {}

    absorptions = (statcan_series or {}).get("absorption", {})
    unabsorbed = (statcan_series or {}).get("unabsorbed_inventory", {})

    if absorptions and unabsorbed:
        # Align to CREA monthly date axis (based on sales series)
        crea_months = set(sales_monthly.keys())
        for dt, a in absorptions.items():
            if dt not in crea_months:
                continue
            u = unabsorbed.get(dt)
            if u is None:
                continue
            denom = a + u
            if denom <= 0:
                continue
            absorption_rate_monthly[dt] = (a / denom) * 100.0

    # ---------------- Assemble PanelRow series --------------------------------------
    def append_metric_series(
        metric: str,
        series: Dict[str, float],
        unit: str,
        source: str,
    ) -> None:
        if not series:
            return

        dates_sorted = sorted(series.keys())
        values = [float(series[d]) for d in dates_sorted]
        mom, yoy, ma3 = compute_changes(values)

        for dt, val, m, y, ma in zip(dates_sorted, values, mom, yoy, ma3):
            rows.append(
                PanelRow(
                    date=dt,
                    region="canada",
                    segment="all",
                    metric=metric,
                    value=round(val, 3),
                    unit=unit,
                    source=source,
                    mom_pct=round(m, 3) if m is not None else None,
                    yoy_pct=round(y, 3) if y is not None else None,
                    ma3=round(ma, 3),
                )
            )

    append_metric_series("new_listings", new_listings_monthly, "count", "crea")
    append_metric_series("active_listings", active_listings_monthly, "count", "crea")
    append_metric_series("snlr", snlr_monthly, "pct", "crea")
    append_metric_series("moi", moi_monthly, "months", "crea")
    append_metric_series("absorption_rate", absorption_rate_monthly, "pct", "statcan_34-10-0149-01")

    print(
        "[INFO] Generated Sales & Listings rows: "
        f"new_listings={len(new_listings_monthly)}, "
        f"active_listings={len(active_listings_monthly)}, "
        f"snlr={len(snlr_monthly)}, "
        f"moi={len(moi_monthly)}, "
        f"absorption_rate={len(absorption_rate_monthly)}"
    )

    return rows


# ---------------------------------------------------------------------------
# IO + entry point
# ---------------------------------------------------------------------------


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sales_rows = generate_sales()
    write_json(DATA_DIR / "sales_listings.json", sales_rows)
    print(f"Wrote {len(sales_rows)} sales/listings rows to {DATA_DIR / 'sales_listings.json'}")


if __name__ == "__main__":
    main()
