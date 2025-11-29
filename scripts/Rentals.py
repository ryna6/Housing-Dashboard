from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"

WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


# ---------------------------------------------------------------------------
# Dataclass shared across tabs
# ---------------------------------------------------------------------------


@dataclass
class PanelRow:
    date: str          # "YYYY-MM-DD"
    region: str        # "toronto" | "vancouver" | "montreal" | "calgary"
    segment: str       # "bachelor" | "1bd" | "2bd" | "all"
    metric: str        # "rent_level" | "rent_to_income" | "price_to_rent" | "rental_vacancy_rate"
    value: float
    unit: str          # "cad" | "pct" | "ratio"
    source: str        # e.g. "statcan_rent", "statcan_vacancy", "cmhc_income", "derived_price_to_rent"
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def compute_changes(
    values: List[float],
) -> Tuple[List[Optional[float]], List[Optional[float]], List[float]]:
    """
    Compute:
      - month-over-month % change (relative to previous observation)
      - year-over-year % change (12-period lag where possible, otherwise
        falls back to previous observation)
      - 3-period trailing moving average of the level

    This is intentionally similar in spirit to the helpers in the other
    tab scripts (Prices, Supply, InflationLabour).
    """
    n = len(values)
    mom: List[Optional[float]] = [None] * n
    yoy: List[Optional[float]] = [None] * n
    ma3: List[float] = [0.0] * n

    for i, v in enumerate(values):
        # 3-period trailing moving average
        window = values[max(0, i - 2): i + 1]
        if window:
            ma3[i] = sum(window) / len(window)

        # MoM relative to previous point
        if i > 0:
            prev = values[i - 1]
            if prev not in (0, None):
                mom[i] = (v / prev - 1.0) * 100.0

        # YoY: prefer 12-period lag; if not available, fall back to prev
        base_index: Optional[int] = None
        if i >= 12:
            base_index = i - 12
        elif i > 0:
            base_index = i - 1

        if base_index is not None:
            base_val = values[base_index]
            if base_val not in (0, None):
                yoy[i] = (v / base_val - 1.0) * 100.0

    return mom, yoy, ma3


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# StatCan WDS helpers
# ---------------------------------------------------------------------------


def _wds_post(endpoint: str, payload: Any) -> Any:
    """
    Minimal helper around the StatCan Web Data Service POST endpoints.
    """
    url = f"{WDS_BASE}/{endpoint}"
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
        return json.loads(raw)
    except HTTPError as e:
        print(f"[WDS] HTTP error for {url}: {e}")
    except URLError as e:
        print(f"[WDS] URL error for {url}: {e}")
    except Exception as e:  # pragma: no cover - defensive
        print(f"[WDS] Unexpected error for {url}: {e}")
    return None


def _normalize_ref_per(ref_per: str) -> Optional[str]:
    """
    Normalize StatCan refPer strings into ISO "YYYY-MM-DD" dates.

    Examples:
      "2024-10"    -> "2024-10-01"
      "2024-10-01" -> "2024-10-01"
      "2024"       -> "2024-01-01"
    """
    s = str(ref_per).strip()
    try:
        # "YYYY-MM"
        if len(s) == 7 and s[4] == "-":
            year = int(s[0:4])
            month = int(s[5:7])
            return date(year, month, 1).isoformat()
        # "YYYY-MM-DD"
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            year = int(s[0:4])
            month = int(s[5:7])
            day = int(s[8:10])
            return date(year, month, day).isoformat()
        # "YYYY"
        if len(s) == 4 and s.isdigit():
            year = int(s)
            return date(year, 1, 1).isoformat()
        # "YYYY/MM" – occasionally seen
        if "/" in s:
            parts = s.split("/")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                year = int(parts[0])
                month = int(parts[1])
                return date(year, month, 1).isoformat()
    except Exception:
        return None
    return None


def fetch_statcan_series(vector_id: int, latest_n: int = 2000) -> Dict[str, float]:
    """
    Fetch a single StatCan vector as a {date -> value} series using WDS.

    We keep only observations where symbolCode is 0 or missing, and
    convert refPer values into "YYYY-MM-DD" strings.

    Returns:
        Dict mapping ISO date strings to float values.
    """
    payload = [{"vectorId": int(vector_id), "latestN": int(latest_n)}]
    resp = _wds_post("getDataFromVectorsAndLatestNPeriods", payload)
    if not resp:
        return {}

    try:
        # The response is typically a list with one element
        obj = resp[0].get("object") or {}
        points = obj.get("vectorDataPoint", []) or []
    except (IndexError, AttributeError):
        return {}

    series: Dict[str, float] = {}

    for dp in points:
        symbol = dp.get("symbolCode")
        if symbol not in (0, None):
            continue

        ref_per = dp.get("refPer")
        value_raw = dp.get("value")
        if ref_per is None or value_raw in (None, ""):
            continue

        date_str = _normalize_ref_per(str(ref_per))
        if not date_str:
            continue

        try:
            value = float(value_raw)
        except (TypeError, ValueError):
            continue

        series[date_str] = value

    return series


# ---------------------------------------------------------------------------
# CMHC median renter income (for rent-to-income)
# ---------------------------------------------------------------------------

INCOME_FILE = "CMHC Median Household Income 2006-2023.xlsx"
INCOME_SHEET = "Renter"

# 1-indexed Excel row numbers for each CMA in the Renter sheet
INCOME_CITY_ROWS: Dict[str, int] = {
    "montreal": 27,
    "toronto": 33,
    "calgary": 44,
    "vancouver": 47,
}


def build_rent_inflation_lookup(
    inflation_rows: List[Any],
) -> Dict[str, Dict[int, float]]:
    """
    Build {region -> {year -> rent YoY % (Dec or latest month)}} lookup
    from the inflation_labour panel rows.

    We look for a metric explicitly named "rent_index" if available; if not,
    we fall back to the first metric that contains "rent" in its name.
    """
    result: Dict[str, Dict[int, float]] = {}
    if not inflation_rows:
        return result

    # Detect which metric name corresponds to rent
    rent_metric_candidates = {"rent_index", "cpi_rent", "rent_cpi"}
    metric_name: Optional[str] = None

    for row in inflation_rows:
        m = getattr(row, "metric", None)
        if m in rent_metric_candidates:
            metric_name = m
            break

    if metric_name is None:
        for row in inflation_rows:
            m = str(getattr(row, "metric", "")).lower()
            if "rent" in m:
                metric_name = getattr(row, "metric")
                break

    if metric_name is None:
        # No rent metric at all – incomes will not be extended
        return result

    # Keep the latest month (highest month number) for each year/region
    tmp: Dict[str, Dict[int, Tuple[int, float]]] = {}

    for row in inflation_rows:
        if getattr(row, "metric", None) != metric_name:
            continue

        yoy = getattr(row, "yoy_pct", None)
        if yoy is None:
            continue

        row_date = getattr(row, "date", None)
        try:
            dt = datetime.strptime(row_date, "%Y-%m-%d").date()
        except Exception:
            continue

        region = getattr(row, "region", "canada")
        year = dt.year
        month = dt.month

        region_map = tmp.setdefault(region, {})
        existing = region_map.get(year)
        if existing is None or month >= existing[0]:
            region_map[year] = (month, float(yoy))

    for region, by_year in tmp.items():
        result[region] = {year: yoy for year, (month, yoy) in by_year.items()}

    return result


def load_median_renter_income(
    inflation_rows: List[Any],
) -> Dict[str, Dict[int, float]]:
    """
    Load median renter household income by city and year from the CMHC
    Excel file, then extend from 2023 to 2024–2025 using rent inflation.

    Returns:
        { region_code ("toronto", "vancouver", ...) -> {year -> income} }
    """
    path = RAW_DATA_DIR / INCOME_FILE
    df = pd.read_excel(path, sheet_name=INCOME_SHEET, header=None)

    incomes: Dict[str, Dict[int, float]] = {city: {} for city in INCOME_CITY_ROWS}

    for region, row_1based in INCOME_CITY_ROWS.items():
        row_idx = row_1based - 1  # convert to 0-based index

        for year in range(2006, 2024):  # 2006–2023 inclusive
            col_idx = 1 + 2 * (year - 2006)  # B=2006, D=2007, F=2008, ...
            if col_idx >= df.shape[1]:
                continue

            val = df.iat[row_idx, col_idx]
            if pd.isna(val):
                continue

            incomes[region][year] = float(val)

    # Extend to 2024–2025 using rent inflation
    rent_infl = build_rent_inflation_lookup(inflation_rows)

    for region, year_map in incomes.items():
        if not year_map:
            continue

        last_year = max(year_map.keys())
        for target_year in (last_year + 1, last_year + 2):
            prev_year = target_year - 1
            prev_income = year_map.get(prev_year)
            if prev_income is None:
                continue

            yoy = rent_infl.get(region, {}).get(target_year)
            if yoy is None:
                yoy = rent_infl.get("canada", {}).get(target_year)

            if yoy is None:
                # No rent inflation – assume flat income
                year_map[target_year] = prev_income
            else:
                year_map[target_year] = prev_income * (1.0 + yoy / 100.0)

    return incomes


# ---------------------------------------------------------------------------
# Series construction helpers
# ---------------------------------------------------------------------------


def series_to_panel_rows(
    dates: List[str],
    values: List[float],
    region: str,
    segment: str,
    metric: str,
    unit: str,
    source: str,
) -> List[PanelRow]:
    """
    Convert a simple (date, value) series into PanelRow objects with
    MoM / YoY / MA3 pre-computed.
    """
    mom, yoy, ma3 = compute_changes(values)
    rows: List[PanelRow] = []

    for dt, v, mom_val, yoy_val, ma3_val in zip(dates, values, mom, yoy, ma3):
        rows.append(
            PanelRow(
                date=dt,
                region=region,
                segment=segment,
                metric=metric,
                value=round(float(v), 2),
                unit=unit,
                source=source,
                mom_pct=round(mom_val, 2) if mom_val is not None else None,
                yoy_pct=round(yoy_val, 2) if yoy_val is not None else None,
                ma3=round(ma3_val, 2),
            )
        )

    return rows


# ---------------------------------------------------------------------------
# Vector mappings (rent level & vacancy)
# ---------------------------------------------------------------------------

# Rent cost: apartment average rent by CMA & bedroom type
RENT_VECTOR_MAP: Dict[str, Dict[str, int]] = {
    "toronto": {
        "bachelor": 1675425046,
        "1bd": 1675425047,
        "2bd": 1675425048,
    },
    "vancouver": {
        "bachelor": 1675425156,
        "1bd": 1675425157,
        "2bd": 1675425158,
    },
    "montreal": {
        "bachelor": 1675425021,
        "1bd": 1675425022,
        "2bd": 1675425023,
    },
    "calgary": {
        "bachelor": 1675425121,
        "1bd": 1675425122,
        "2bd": 1675425123,
    },
}

# Rental vacancy rate by CMA (all bedroom types)
VACANCY_VECTOR_MAP: Dict[str, int] = {
    "toronto": 1930324,
    "vancouver": 1930326,
    "montreal": 1930310,
    "calgary": 1930302,
}


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------


def generate_rentals(
    prices_rows: List[Any],
    inflation_rows: List[Any],
) -> List[PanelRow]:
    """
    Generate the full rentals panel:

      - rent_level          (StatCan WDS – apartment rent by CMA & bedroom)
      - rent_to_income      (rent vs CMHC median renter income)
      - price_to_rent       (apartment avg price / 2-bedroom rent)
      - rental_vacancy_rate (StatCan WDS – vacancy rate by CMA)

    Arguments:
      prices_rows    Panel rows from Prices.generate_prices()
      inflation_rows Panel rows from InflationLabour.generate_inflation()
    """
    rows: List[PanelRow] = []

    # 1) Median renter income by city/year (extended to 2024–2025)
    incomes_by_region_year = load_median_renter_income(inflation_rows)

    # 2) Rent level series and rent-to-income
    rent_series_by_region_segment: Dict[Tuple[str, str], Dict[str, float]] = {}

    for region, seg_map in RENT_VECTOR_MAP.items():
        for segment, vector_id in seg_map.items():
            series = fetch_statcan_series(vector_id)
            if not series:
                continue

            rent_series_by_region_segment[(region, segment)] = series

            dates_sorted = sorted(series.keys())
            values = [series[d] for d in dates_sorted]

            # 2A) Rent level
            rows.extend(
                series_to_panel_rows(
                    dates_sorted,
                    values,
                    region=region,
                    segment=segment,
                    metric="rent_level",
                    unit="cad",
                    source=f"statcan_rent_{vector_id}",
                )
            )

            # 2B) Rent-to-income (annual rent / median renter income)
            rti_dates: List[str] = []
            rti_values: List[float] = []

            for d in dates_sorted:
                year = int(d[0:4])
                income = incomes_by_region_year.get(region, {}).get(year)
                if not income or income <= 0:
                    continue

                rent_level = series[d]
                annual_rent = rent_level * 12.0
                rti_pct = (annual_rent / income) * 100.0

                rti_dates.append(d)
                rti_values.append(rti_pct)

            if rti_values:
                rows.extend(
                    series_to_panel_rows(
                        rti_dates,
                        rti_values,
                        region=region,
                        segment=segment,
                        metric="rent_to_income",
                        unit="pct",
                        source="cmhc_income+statcan_rent",
                    )
                )

    # 3) Rental vacancy rate (city-level, no bedroom split)
    for region, vector_id in VACANCY_VECTOR_MAP.items():
        series = fetch_statcan_series(vector_id)
        if not series:
            continue

        dates_sorted = sorted(series.keys())
        values = [series[d] for d in dates_sorted]

        rows.extend(
            series_to_panel_rows(
                dates_sorted,
                values,
                region=region,
                segment="all",
                metric="rental_vacancy_rate",
                unit="pct",
                source=f"statcan_vacancy_{vector_id}",
            )
        )

    # 4) Price-to-rent (apartment avg price / 2-bedroom rent)
    # Build quick lookup for apartment average prices:
    price_lookup: Dict[Tuple[str, str], float] = {}

    for row in prices_rows or []:
        metric = getattr(row, "metric", None)
        segment = getattr(row, "segment", None)
        if metric != "avg_price" or segment != "apartment":
            continue

        region_code = getattr(row, "region", None)
        dt = getattr(row, "date", None)
        if not region_code or not dt:
            continue

        try:
            value = float(getattr(row, "value", 0.0))
        except (TypeError, ValueError):
            continue

        price_lookup[(region_code, dt)] = value

    # Map rentals city codes to price region codes
    PRICE_REGION_MAP: Dict[str, str] = {
        "toronto": "greater_toronto",
        "vancouver": "greater_vancouver",
        "montreal": "montreal",
        "calgary": "calgary",
    }

    price_to_rent_series: Dict[str, Dict[str, float]] = {}

    for (region, segment), series in rent_series_by_region_segment.items():
        if segment != "2bd":
            continue

        price_region = PRICE_REGION_MAP.get(region)
        if not price_region:
            continue

        for d, rent_level in series.items():
            if rent_level is None or rent_level <= 0:
                continue

            price = price_lookup.get((price_region, d))
            if price is None:
                continue

            ptr_years = price / (rent_level * 12.0)
            region_series = price_to_rent_series.setdefault(region, {})
            region_series[d] = ptr_years

    for region, series in price_to_rent_series.items():
        dates_sorted = sorted(series.keys())
        values = [series[d] for d in dates_sorted]

        rows.extend(
            series_to_panel_rows(
                dates_sorted,
                values,
                region=region,
                segment="2bd",  # explicitly 2-bedroom based
                metric="price_to_rent",
                unit="ratio",
                source="derived_price_to_rent",
            )
        )

    return rows


# ---------------------------------------------------------------------------
# Standalone entry-point
# ---------------------------------------------------------------------------


def _load_panel_rows_from_json(path: Path) -> List[PanelRow]:
    """
    Convenience loader so this script can be run standalone, by reading
    prices.json and inflation_labour.json that were generated earlier.
    """
    if not path.exists():
        return []

    raw = json.loads(path.read_text(encoding="utf-8"))
    rows: List[PanelRow] = []

    for obj in raw:
        try:
            rows.append(
                PanelRow(
                    date=obj["date"],
                    region=obj["region"],
                    segment=obj.get("segment", "all"),
                    metric=obj["metric"],
                    value=float(obj["value"]),
                    unit=obj.get("unit", ""),
                    source=obj.get("source", ""),
                    mom_pct=obj.get("mom_pct"),
                    yoy_pct=obj.get("yoy_pct"),
                    ma3=obj.get("ma3"),
                )
            )
        except KeyError:
            continue

    return rows


def main() -> None:
    """
    When run directly, read prices.json and inflation_labour.json from
    data/processed, generate rentals.json, and write it back into that
    directory.

    In the normal build pipeline, scripts/generate_data.py should call
    generate_rentals(prices, inflation) directly instead.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    prices_rows = _load_panel_rows_from_json(DATA_DIR / "prices.json")
    inflation_rows = _load_panel_rows_from_json(DATA_DIR / "inflation_labour.json")

    rentals = generate_rentals(prices_rows, inflation_rows)

    out_path = DATA_DIR / "rentals.json"
    write_json(out_path, rentals)
    print(f"Wrote {len(rentals)} rentals rows to {out_path}")


if __name__ == "__main__":
    main()
