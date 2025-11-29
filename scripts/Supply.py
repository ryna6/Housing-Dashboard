from __future__ import annotations

import json
import urllib.request
from urllib.error import HTTPError, URLError
from dataclasses import dataclass, asdict
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

# Root paths
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"

# StatCan Web Data Service base URL
WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest"


@dataclass
class PanelRow:
    date: str          # "YYYY-MM-DD" (use the first of the month)
    region: str        # always "canada"
    segment: str       # always "all"
    metric: str        # "housing_starts" | "under_construction" |
                       # "completions" | "investment_construction" | "vacancy_rate"
    value: float
    unit: str          # "count" | "cad" | "pct"
    source: str        # "cmhc" | "statcan_34-10-0130-01" | "statcan_34-10-0293-01"
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
# Helpers for CMHC Excel files
# ---------------------------------------------------------------------------

MONTH_MAP: Dict[str, int] = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def _parse_month(month_str: str) -> Optional[int]:
    if month_str is None:
        return None
    s = str(month_str).strip().lower()
    return MONTH_MAP.get(s)


def _make_month_key(year_val: object, month_label: object) -> Optional[str]:
    try:
        year = int(year_val)
    except (TypeError, ValueError):
        return None

    month = _parse_month(str(month_label))
    if not month:
        return None

    try:
        d = date(year, month, 1)
    except ValueError:
        return None
    return d.isoformat()


def load_cmhc_housing_starts() -> Dict[str, float]:
    """
    Load CMHC housing starts (urban centres, SAAR) from Table 3 in the
    three CMHC workbooks and convert to monthly levels:

        monthly_housing_starts = starts_saar / 12
    """
    files = [
        "CMHC Housing & Construction Data 2020-2021.xlsx",
        "CMHC Housing & Construction Data 2022-2023.xlsx",
        "CMHC Housing & Construction Data 2024-2025.xlsx",
    ]

    series: Dict[str, float] = {}

    for fname in files:
        path = RAW_DATA_DIR / fname
        if not path.exists():
            print(f"[WARN] CMHC starts file missing: {path}")
            continue

        try:
            df = pd.read_excel(path, sheet_name="Table 3", header=None)
        except Exception as e:
            print(f"[WARN] Failed to read CMHC Table 3 from {path}: {e}")
            continue

        if df.empty:
            continue

        # Forward-fill the year column (col A / index 0)
        years = df[0].ffill()

        for idx, row in df.iterrows():
            month_label = row[1]
            key = _make_month_key(years.iloc[idx], month_label)
            if not key:
                continue

            # Column F (index 5) = Total urban centres starts, SAAR
            val = row[5]
            if val is None or (isinstance(val, float) and pd.isna(val)):
                continue

            try:
                saar = float(val)
            except (TypeError, ValueError):
                continue

            monthly_level = saar / 12.0
            series[key] = monthly_level

    return series


def load_cmhc_under_construction_and_completions() -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Load CMHC "under construction" and derive completions from Table 16.

    Table 16 structure (per CMHC documentation and inspection):

        Columns:
          0: Year
          1: Period (month, quarter label, etc.)
          3: % absorbed at completion (single detached)
          4: Completed and unabsorbed (single detached units)
          5: Under construction (single detached)
          6: % absorbed at completion (row, apartment, other)
          7: Completed and unabsorbed (row, apartment, other)
          8: Under construction (row, apartment, other)

    For each month:

        under_construction_total = F + I   # stock, not annualized

        Let p = % absorbed at completion (e.g. 87 → 0.87).
        Let U = completed & unabsorbed units.

        Then U = (1 - p) * completions  ⇒  completions = U / (1 - p).

        We treat completions as annualized and divide by 12 to obtain
        a monthly completion flow.
    """
    files = [
        "CMHC Housing & Construction Data 2020-2021.xlsx",
        "CMHC Housing & Construction Data 2022-2023.xlsx",
        "CMHC Housing & Construction Data 2024-2025.xlsx",
    ]

    under_construction: Dict[str, float] = {}
    completions: Dict[str, float] = {}

    for fname in files:
        path = RAW_DATA_DIR / fname
        if not path.exists():
            print(f"[WARN] CMHC absorption file missing: {path}")
            continue

        try:
            df = pd.read_excel(path, sheet_name="Table 16", header=None)
        except Exception as e:
            print(f"[WARN] Failed to read CMHC Table 16 from {path}: {e}")
            continue

        if df.empty:
            continue

        years = df[0].ffill()

        for idx, row in df.iterrows():
            month_label = row[1]
            key = _make_month_key(years.iloc[idx], month_label)
            if not key:
                continue

            # Under construction: single (F) + multi (I)
            uc_single = row[5]
            uc_multi = row[8]
            uc_total = 0.0
            any_uc = False

            for v in (uc_single, uc_multi):
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    continue
                try:
                    uc_total += float(v)
                    any_uc = True
                except (TypeError, ValueError):
                    continue

            if any_uc:
                under_construction[key] = uc_total

            # Completions – derived from % absorbed and completed & unabsorbed
            pct_single = row[3]
            pct_multi = row[6]
            comp_unabs_single = row[4]
            comp_unabs_multi = row[7]

            try:
                p_single = float(pct_single) if pct_single not in (None, "") else float("nan")
            except (TypeError, ValueError):
                p_single = float("nan")
            try:
                p_multi = float(pct_multi) if pct_multi not in (None, "") else float("nan")
            except (TypeError, ValueError):
                p_multi = float("nan")

            # Skip if either percentage is missing, <= 0 or >= 100 (cannot infer reliably)
            if (
                pd.isna(p_single)
                or pd.isna(p_multi)
                or p_single <= 0
                or p_single >= 100
                or p_multi <= 0
                or p_multi >= 100
            ):
                continue

            try:
                u_single = float(comp_unabs_single) if comp_unabs_single not in (None, "") else 0.0
            except (TypeError, ValueError):
                u_single = 0.0
            try:
                u_multi = float(comp_unabs_multi) if comp_unabs_multi not in (None, "") else 0.0
            except (TypeError, ValueError):
                u_multi = 0.0

            # p is the absorbed share; (1 - p) is the unabsorbed share
            alpha_single = p_single / 100.0
            alpha_multi = p_multi / 100.0
            denom_single = 1.0 - alpha_single
            denom_multi = 1.0 - alpha_multi

            if denom_single <= 0 or denom_multi <= 0:
                continue

            # Annualized completions
            completions_single_annual = u_single / denom_single
            completions_multi_annual = u_multi / denom_multi
            completions_total_annual = completions_single_annual + completions_multi_annual

            # Convert to monthly flow
            completions_total_monthly = completions_total_annual / 12.0

            completions[key] = completions_total_monthly

    return under_construction, completions


# ---------------------------------------------------------------------------
# StatCan WDS helpers
# ---------------------------------------------------------------------------

def fetch_statcan_series(vector_id: int, latest_n: int = 2000) -> Dict[str, float]:
    """
    Generic helper to fetch a single StatCan vector as a date->value series
    using the Web Data Service (WDS).

    We keep only data points where symbolCode is 0 or missing, and convert
    refPer values like "2024-10" into "YYYY-MM-01" ISO date strings.
    """
    base_url = f"{WDS_BASE}/getDataFromVectorsAndLatestNPeriods"
    payload = [{"vectorId": int(vector_id), "latestN": latest_n}]
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        base_url,
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
        print(f"[WARN] StatCan WDS fetch failed for {vector_id}: {e}")
        return {}

    if not isinstance(res, list) or not res:
        print(f"[WARN] StatCan WDS response not a non-empty list for {vector_id}")
        return {}

    series: Dict[str, float] = {}

    for entry in res:
        if entry.get("status") != "SUCCESS":
            continue
        obj = entry.get("object") or {}
        for dp in obj.get("vectorDataPoint", []):
            value = dp.get("value")
            symbol = dp.get("symbolCode")

            if value in (None, "", "NaN"):
                continue
            # Keep only normal values
            if symbol not in (0, None):
                continue

            try:
                v = float(value)
            except (TypeError, ValueError):
                continue

            ref = dp.get("refPer") or dp.get("refPerRaw")
            if not ref:
                continue
            # Normalize "YYYY-MM" to "YYYY-MM-01"
            if len(ref) == 7:
                ref = ref + "-01"
            try:
                d = datetime.fromisoformat(ref[:10]).date()
            except Exception:
                continue

            key = date(d.year, d.month, 1).isoformat()
            series[key] = v

    return series


def fetch_vacancy_rate() -> Dict[str, float]:
    """
    Rental vacancy rate (%) for Canada, row & apartment structures of
    3+ units, privately initiated.

    StatCan table 34-10-0130-01, vector v1930301.
    """
    return fetch_statcan_series(1930301)


def fetch_investment_construction() -> Dict[str, float]:
    """
    Investment in residential building construction, Canada total.

    StatCan table 34-10-0293-01, vector v1705315944.
    The source vector is at an annualized rate (SAAR); we convert to
    monthly levels in generate_supply().
    """
    return fetch_statcan_series(1705315944)


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def _series_to_panel_rows(
    metric: str,
    series: Dict[str, float],
    unit: str,
    source: str,
) -> List[PanelRow]:
    if not series:
        return []

    items = sorted(series.items())  # sort by date string "YYYY-MM-DD"
    dates = [d for d, _ in items]
    values = [float(v) for _, v in items]

    mom, yoy, ma3 = compute_changes(values)

    rows: List[PanelRow] = []
    for dt, val, m, y, ma in zip(dates, values, mom, yoy, ma3):
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
    return rows


def generate_supply() -> List[PanelRow]:
    """
    Generate the Supply tab panel rows:

      - housing_starts           (CMHC, Table 3, SAAR -> monthly)
      - under_construction       (CMHC, Table 16, F + I)
      - completions              (CMHC, Table 16, derived, SAAR -> monthly)
      - investment_construction  (StatCan 34-10-0293-01, v1705315944, SAAR -> monthly)
      - vacancy_rate             (StatCan 34-10-0130-01, v1930301)
    """
    # CMHC metrics
    starts_series = load_cmhc_housing_starts()
    under_construction_series, completions_series = load_cmhc_under_construction_and_completions()

    # StatCan metrics
    # Investment is reported at an annualized (SAAR) rate → convert to monthly.
    investment_annual = fetch_investment_construction()
    investment_series = {d: v / 12.0 for d, v in investment_annual.items()}

    vacancy_series = fetch_vacancy_rate()

    rows: List[PanelRow] = []
    rows.extend(
        _series_to_panel_rows(
            metric="housing_starts",
            series=starts_series,
            unit="count",
            source="cmhc",
        )
    )
    rows.extend(
        _series_to_panel_rows(
            metric="under_construction",
            series=under_construction_series,
            unit="count",
            source="cmhc",
        )
    )
    rows.extend(
        _series_to_panel_rows(
            metric="completions",
            series=completions_series,
            unit="count",
            source="cmhc",
        )
    )
    rows.extend(
        _series_to_panel_rows(
            metric="investment_construction",
            series=investment_series,
            unit="cad",
            source="statcan_34-10-0293-01",
        )
    )
    rows.extend(
        _series_to_panel_rows(
            metric="vacancy_rate",
            series=vacancy_series,
            unit="pct",
            source="statcan_34-10-0130-01",
        )
    )

    return rows


# Backwards-compat alias so existing imports still work if they
# expect generate_supply_pipeline().
def generate_supply_pipeline() -> List[PanelRow]:  # pragma: no cover - simple alias
    return generate_supply()


def write_json(path: Path, rows: List[PanelRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [asdict(r) for r in rows]
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = generate_supply()
    out_path = DATA_DIR / "supply.json"
    write_json(out_path, rows)
    print(f"Wrote {len(rows)} supply rows to {out_path}")


if __name__ == "__main__":
    main()
