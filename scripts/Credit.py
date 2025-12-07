from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from urllib.request import urlopen
from urllib.parse import urlencode

import pandas as pd


# --------------------------------------------------------------------------------------
# Paths & basic types
# --------------------------------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data" / "processed"
RAW_DATA_DIR = ROOT_DIR / "data" / "raw"


@dataclass
class PanelRow:
    """
    Canonical panel-row format used by the app.
    """

    date: str
    region: str
    segment: str
    metric: str
    value: float
    unit: str
    source: str
    mom_pct: Optional[float]
    yoy_pct: Optional[float]
    ma3: Optional[float]


# --------------------------------------------------------------------------------------
# StatCan credit series (household & business) via WDS (no `requests`)
# --------------------------------------------------------------------------------------

STATCAN_WDS_URL = (
    "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange"
)

# Vector IDs (same ones you were using before)
V_HH_NON_MORTGAGE = 1231415611  # Non-mortgage loans (SA) – households
V_HH_MORTGAGE = 1231415620      # Mortgage loans (SA) – households
V_HH_TOTAL_CREDIT = 1231415625  # Total credit (SA) – households

V_BUS_NON_MORTGAGE = 1231415688       # Non-mortgage loans (SA) – business
V_BUS_MORTGAGE = 1231415692           # Mortgage loans (SA) – business
V_BUS_TOTAL_CREDIT = 1304432231       # Total credit liabilities – private NFC
V_BUS_TOTAL_CREDIT_EQUITY = 1231415703  # Total credit liabilities + equity securities


def fetch_statcan_vectors(
    vector_ids: Iterable[int],
    start_ref_period: str = "1980-01-01",
    end_ref_period: str = "2100-01-01",
) -> pd.DataFrame:
    """
    Fetch one or more StatCan vectors via the WDS REST API and return a tidy DataFrame:

        columns: ["vector_id", "date", "value"]

    Uses only stdlib (`urllib`) so we don't depend on `requests`.
    """
    ids = list(vector_ids)
    if not ids:
        return pd.DataFrame(columns=["vector_id", "date", "value"])

    params = {
        "vectorIds": ",".join(str(v) for v in ids),
        "startRefPeriod": start_ref_period,
        "endReferencePeriod": end_ref_period,
    }
    query = urlencode(params)
    url = f"{STATCAN_WDS_URL}?{query}"

    with urlopen(url) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    records: List[Dict] = []
    for item in payload:
        if item.get("status") != "SUCCESS":
            continue
        obj = item["object"]
        vid = str(obj["vectorId"])
        for dp in obj.get("vectorDataPoint", []):
            v = dp.get("value")
            if v is None:
                continue
            date = pd.to_datetime(dp["refPer"])
            value = float(v)
            records.append({"vector_id": vid, "date": date, "value": value})

    df = pd.DataFrame.from_records(records)
    if df.empty:
        return df

    return df.sort_values(["vector_id", "date"]).reset_index(drop=True)


def load_household_credit_from_statcan() -> Dict[str, pd.Series]:
    """
    Returns monthly household credit series:

    - household_non_mortgage_loans
    - household_mortgage_loans
    - household_mortgage_share_of_credit
    """
    df = fetch_statcan_vectors(
        [V_HH_NON_MORTGAGE, V_HH_MORTGAGE, V_HH_TOTAL_CREDIT]
    )
    if df.empty:
        raise RuntimeError("No StatCan household credit data returned.")

    pivot = df.pivot(index="date", columns="vector_id", values="value")

    hh_non_mortgage = pivot[str(V_HH_NON_MORTGAGE)]
    hh_mortgage = pivot[str(V_HH_MORTGAGE)]
    hh_total_credit = pivot[str(V_HH_TOTAL_CREDIT)]

    mortgage_share = (hh_mortgage / hh_total_credit) * 100.0

    return {
        "household_non_mortgage_loans": hh_non_mortgage,
        "household_mortgage_loans": hh_mortgage,
        "household_mortgage_share_of_credit": mortgage_share,
    }


def load_business_credit_from_statcan() -> Dict[str, pd.Series]:
    """
    Returns business / corporate loan + equity series:

    - business_total_debt
    - business_equity
    """
    df = fetch_statcan_vectors(
        [
            V_BUS_NON_MORTGAGE,
            V_BUS_MORTGAGE,
            V_BUS_TOTAL_CREDIT,
            V_BUS_TOTAL_CREDIT_EQUITY,
        ]
    )
    if df.empty:
        raise RuntimeError("No StatCan business credit data returned.")

    pivot = df.pivot(index="date", columns="vector_id", values="value")

    business_total_credit = pivot[str(V_BUS_TOTAL_CREDIT)]
    total_credit_plus_equity = pivot[str(V_BUS_TOTAL_CREDIT_EQUITY)]
    business_equity = total_credit_plus_equity - business_total_credit

    return {
        "business_total_debt": business_total_credit,
        "business_equity": business_equity,
    }


# --------------------------------------------------------------------------------------
# Insolvency (OSB/ISED) – default rate proxy
# --------------------------------------------------------------------------------------

INSOLVENCY_XLSX = RAW_DATA_DIR / "ISED Insolvency Data 1987-2025.xlsx"


def load_insolvency_series() -> Dict[str, pd.Series]:
    """
    Load monthly consumer + business insolvency counts from the ISED/OSB file.

    Sheet name is now 'Monthly_mensuels' (with capital M).

    Layout (as per your description):
    - Canada aggregates are in rows 2–16; consumer row 5, business row 8.
    - First month: Jan 1987 in column C; Feb 1987 = D; etc.

    Returns two monthly series indexed by Timestamp:

    - household_default_rate (proxy – counts)
    - business_default_rate (proxy – counts)
    """
    df_raw = pd.read_excel(
        INSOLVENCY_XLSX,
        sheet_name="Monthly_mensuels",  # updated sheet name
        header=None,
    )

    # Row index is 0-based; row 5 -> index 4, row 8 -> index 7
    consumer_row = df_raw.iloc[4, 2:]  # C5 onwards
    business_row = df_raw.iloc[7, 2:]  # C8 onwards

    consumer_vals = consumer_row.dropna()
    business_vals = business_row.iloc[: len(consumer_vals)].dropna()

    n_months = len(consumer_vals)
    start_date = pd.Timestamp(year=1987, month=1, day=1)
    dates = pd.date_range(start=start_date, periods=n_months, freq="MS")

    s_household = pd.Series(
        consumer_vals.to_numpy(dtype=float), index=dates
    ).sort_index()
    s_business = pd.Series(
        business_vals.to_numpy(dtype=float), index=dates
    ).sort_index()

    return {
        "household_default_rate": s_household,
        "business_default_rate": s_business,
    }


# --------------------------------------------------------------------------------------
# CMHC mortgage delinquency – household mortgage delinquency rate
# --------------------------------------------------------------------------------------

CMHC_DELINQ_XLSX = RAW_DATA_DIR / "CMHC Delinquency Rate 2012-2025.xlsx"


def load_mortgage_delinquency_series() -> pd.Series:
    """
    Load quarterly mortgage delinquency rate (% of mortgages 90+ days in arrears).
    """
    df_raw = pd.read_excel(
        CMHC_DELINQ_XLSX,
        sheet_name="Mortgage delinquency rate",
        header=None,
    )

    values_row = df_raw.iloc[5, 2:]  # row 6 (index 5), from column C onwards
    values = values_row.dropna()
    n_quarters = len(values)

    quarters = pd.period_range(start="2012Q3", periods=n_quarters, freq="Q")
    dates = quarters.to_timestamp(how="start")  # first day of each quarter

    s = pd.Series(values.to_numpy(dtype=float), index=dates).sort_index()
    return s.rename("household_mortgage_delinquency_rate")


# --------------------------------------------------------------------------------------
# BIS non-financial corporate DSR – business NFC DSR (quarterly)
# --------------------------------------------------------------------------------------

def load_business_dsr_from_bis() -> pd.Series:
    """
    Stub for BIS NFC DSR loader – implement later.
    """
    raise NotImplementedError(
        "Implement BIS NFC DSR loader (business_nfc_dsr) using BIS WS_DSR API or a local CSV."
    )


# --------------------------------------------------------------------------------------
# Helpers: trimming + PanelRow conversion
# --------------------------------------------------------------------------------------

def trim_to_last_n_years(series: pd.Series, years: int = 10) -> pd.Series:
    if series.empty:
        return series
    last_date = series.index.max()
    cutoff = last_date - pd.DateOffset(years=years)
    return series[series.index >= cutoff]


def series_to_panel_rows(
    series: pd.Series,
    metric: str,
    unit: str,
    source: str,
    freq: str,
    region: str = "Canada",
    segment: str = "All",
) -> List[PanelRow]:
    """
    Convert a time series into a list of PanelRow objects, computing simple MoM/QoQ and YoY.
    """
    if series.empty:
        return []

    df = series.to_frame("value").sort_index()

    if freq == "M":
        df["mom_pct"] = df["value"].pct_change(1) * 100.0
        df["yoy_pct"] = df["value"].pct_change(12) * 100.0
        ma_window = 3
    elif freq == "Q":
        df["mom_pct"] = df["value"].pct_change(1) * 100.0  # QoQ
        df["yoy_pct"] = df["value"].pct_change(4) * 100.0
        ma_window = 3
    else:
        df["mom_pct"] = df["value"].pct_change(1) * 100.0
        df["yoy_pct"] = None
        ma_window = 3

    df["ma3"] = df["value"].rolling(ma_window).mean()

    rows: List[PanelRow] = []
    for ts, row in df.iterrows():
        date_str = pd.Timestamp(ts).strftime("%Y-%m-01")
        rows.append(
            PanelRow(
                date=date_str,
                region=region,
                segment=segment,
                metric=metric,
                value=float(row["value"]),
                unit=unit,
                source=source,
                mom_pct=float(row["mom_pct"]) if pd.notna(row["mom_pct"]) else None,
                yoy_pct=float(row["yoy_pct"]) if pd.notna(row["yoy_pct"]) else None,
                ma3=float(row["ma3"]) if pd.notna(row["ma3"]) else None,
            )
        )
    return rows


# --------------------------------------------------------------------------------------
# Main builder: combine everything into one panel
# --------------------------------------------------------------------------------------

def build_credit_panel() -> List[PanelRow]:
    rows: List[PanelRow] = []

    # --- Household StatCan credit ---
    hh_credit = load_household_credit_from_statcan()
    for key, series in hh_credit.items():
        s = trim_to_last_n_years(series, years=10)
        unit = "%" if key == "household_mortgage_share_of_credit" else "C$ millions"
        rows.extend(
            series_to_panel_rows(
                s,
                metric=key,
                unit=unit,
                source="StatCan",
                freq="M",
            )
        )

    # --- Business StatCan credit / equity ---
    bus_credit = load_business_credit_from_statcan()

    s_debt = trim_to_last_n_years(bus_credit["business_total_debt"], years=10)
    rows.extend(
        series_to_panel_rows(
            s_debt,
            metric="business_total_debt",
            unit="C$ millions",
            source="StatCan",
            freq="M",
        )
    )

    s_equity = trim_to_last_n_years(bus_credit["business_equity"], years=10)
    rows.extend(
        series_to_panel_rows(
            s_equity,
            metric="business_equity",
            unit="C$ millions",
            source="StatCan",
            freq="M",
        )
    )

    aligned = pd.concat(
        [s_debt.rename("debt"), s_equity.rename("equity")], axis=1
    ).dropna()
    if not aligned.empty:
        d_to_e = (aligned["debt"] / aligned["equity"]).rename(
            "business_debt_to_equity"
        )
        d_to_e = trim_to_last_n_years(d_to_e, years=10)
        rows.extend(
            series_to_panel_rows(
                d_to_e,
                metric="business_debt_to_equity",
                unit="ratio",
                source="StatCan",
                freq="M",
            )
        )

    # --- Insolvencies: household + business default rate (proxy) ---
    insolv = load_insolvency_series()
    hh_default = trim_to_last_n_years(insolv["household_default_rate"], years=10)
    rows.extend(
        series_to_panel_rows(
            hh_default,
            metric="household_default_rate",
            unit="count",
            source="OSB/ISED",
            freq="M",
        )
    )

    bus_default = trim_to_last_n_years(insolv["business_default_rate"], years=10)
    rows.extend(
        series_to_panel_rows(
            bus_default,
            metric="business_default_rate",
            unit="count",
            source="OSB/ISED",
            freq="M",
        )
    )

    # --- CMHC mortgage delinquency (quarterly) ---
    hh_delinquency = load_mortgage_delinquency_series()
    hh_delinquency = trim_to_last_n_years(hh_delinquency, years=10)
    rows.extend(
        series_to_panel_rows(
            hh_delinquency,
            metric="household_mortgage_delinquency_rate",
            unit="%",
            source="CMHC",
            freq="Q",
        )
    )

    # --- BIS NFC DSR (quarterly) ---
    try:
        nfc_dsr = load_business_dsr_from_bis()
    except NotImplementedError:
        nfc_dsr = pd.Series(dtype=float)

    if not nfc_dsr.empty:
        nfc_dsr = trim_to_last_n_years(nfc_dsr, years=10)
        rows.extend(
            series_to_panel_rows(
                nfc_dsr,
                metric="business_nfc_dsr",
                unit="%",
                source="BIS",
                freq="Q",
            )
        )

    return rows


# --------------------------------------------------------------------------------------
# Public entrypoint used by generate_data.py
# --------------------------------------------------------------------------------------

def generate_credit() -> None:
    rows = build_credit_panel()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / "panel_credit.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump([asdict(r) for r in rows], f, ensure_ascii=False)
    print(f"[Credit] Wrote {len(rows)} rows → {out_path}")


if __name__ == "__main__":
    generate_credit()
