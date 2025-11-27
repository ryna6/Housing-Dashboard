from pathlib import Path
from typing import Iterable

import pandas as pd

from model import PanelRow  # noqa: F401 (used as schema contract)
from transforms.derived_metrics import add_changes, compute_snlr_moi
from config import TAB_FILES

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
PROCESSED_DIR = DATA_DIR / "processed"


def _empty_panel_df() -> pd.DataFrame:
    columns = [
        "date",
        "region",
        "segment",
        "metric",
        "value",
        "unit",
        "source",
        "mom_pct",
        "yoy_pct",
        "ma3",
    ]
    return pd.DataFrame(columns=columns)


def load_existing_panel() -> pd.DataFrame:
    panel_path = PROCESSED_DIR / "panel.json"
    if panel_path.exists() and panel_path.stat().st_size > 0:
        try:
            df = pd.read_json(panel_path)
            return df
        except ValueError:
            # corrupt or placeholder — fall back to empty
            return _empty_panel_df()
    return _empty_panel_df()


def write_json(df: pd.DataFrame, path: Path) -> None:
    if df.empty:
        path.write_text("[]", encoding="utf-8")
        return
    # Ensure date is ISO string
    if "date" in df.columns and not pd.api.types.is_string_dtype(df["date"]):
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    path.write_text(
        df.to_json(orient="records", date_format="iso"), encoding="utf-8"
    )


def save_tab(df: pd.DataFrame, mask: Iterable[bool], filename: str) -> None:
    target = PROCESSED_DIR / filename
    if df.empty:
        write_json(df, target)
        return
    df_tab = df.loc[mask].copy()
    write_json(df_tab, target)


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    # In MVP, we *do not* yet fetch from BoC/StatCan to avoid NotImplemented errors.
    # We just work with any existing panel.json (or start empty).
    df = load_existing_panel()

    if not df.empty:
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"])
        df = add_changes(df)
        df = compute_snlr_moi(df)

    # Persist canonical panel
    write_json(df, PROCESSED_DIR / "panel.json")

    # Prices
    save_tab(
        df,
        df["metric"].str.contains("hpi|avg_price|teranet", case=False)
        if not df.empty
        else [],
        TAB_FILES["prices"],
    )

    # Sales / listings
    save_tab(
        df,
        df["metric"].isin(["sales", "new_listings", "active_listings", "snlr", "moi"])
        if not df.empty
        else [],
        TAB_FILES["sales_listings"],
    )

    # Supply pipeline
    save_tab(
        df,
        df["metric"].isin(["starts", "completions", "under_construction", "permits"])
        if not df.empty
        else [],
        TAB_FILES["supply_pipeline"],
    )

    # Rates / bonds
    save_tab(
        df,
        df["metric"].isin(
            [
                "policy_rate",
                "mortgage_5y",
                "gov_2y_yield",
                "gov_5y_yield",
                "gov_10y_yield",
                "mortgage_5y_spread",
            ]
        )
        if not df.empty
        else [],
        TAB_FILES["rates_bonds"],
    )

    # Inflation / labour
    save_tab(
        df,
        df["metric"].isin(
            ["cpi_headline", "cpi_shelter", "cpi_rent", "wage_index", "unemployment_rate"]
        )
        if not df.empty
        else [],
        TAB_FILES["inflation_labour"],
    )

    # Credit stress
    save_tab(
        df,
        df["metric"].isin(
            ["insolvencies", "bankruptcies", "mortgage_arrears", "consumer_delinquency"]
        )
        if not df.empty
        else [],
        TAB_FILES["credit_stress"],
    )

    # Market risk
    save_tab(
        df,
        df["metric"].isin(["tsx_index", "hy_spread", "risk_composite"])
        if not df.empty
        else [],
        TAB_FILES["market_risk"],
    )

    # Rentals
    save_tab(
        df,
        df["metric"].isin(["avg_rent", "rent_index", "vacancy_rate", "rent_inflation"])
        if not df.empty
        else [],
        TAB_FILES["rentals"],
    )


if __name__ == "__main__":
    main()
