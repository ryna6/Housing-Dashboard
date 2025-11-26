from pathlib import Path
import pandas as pd

from model import PanelRow
from sources.boc import fetch_boc_series
from transforms.derived_metrics import add_changes, compute_snlr_moi

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

def main():
    processed_dir = DATA_DIR / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    # ---- 1. Fetch BoC rates / yields (national) ----
    boc_df = fetch_boc_series(
        ["V39079", "V39051", "V39053", "V39055"],
        start="2000-01-01",
    )
    boc_rows = []
    for _, row in boc_df.iterrows():
        dt = row["date"].to_period("M").to_timestamp("M")
        date_str = dt.strftime("%Y-%m-01")
        boc_rows += [
            PanelRow(
                date=date_str,
                region="canada",
                segment="all",
                metric="boc_overnight",
                value=row["V39079"],
                unit="percent",
                source="boc_v39079",
            ),
            PanelRow(
                date=date_str,
                region="canada",
                segment="all",
                metric="goc_2y_yield",
                value=row["V39051"],
                unit="percent",
                source="boc_v39051",
            ),
            # etc. for 5y / 10y...
        ]

    # ---- 2. Pull CPI + unemployment from StatCan ----
    # You’ll implement fetch_statcan_cpi(), fetch_statcan_unemp()
    # producing PanelRow items for canada/on/bc...

    all_rows: list[PanelRow] = []
    all_rows.extend(boc_rows)
    # all_rows.extend(cpi_rows)
    # all_rows.extend(unemp_rows)
    # all_rows.extend(cmhc_rows)
    # all_rows.extend(crea_rows)
    # all_rows.extend(cba_rows)
    # all_rows.extend(osb_rows)
    # all_rows.extend(tsx_rows)
    # all_rows.extend(manual_trreb_rows)
    # all_rows.extend(teranet_rows)
    # ...

    df = pd.DataFrame([r.__dict__ for r in all_rows])

    # Derived metrics
    df = compute_snlr_moi(df)
    # yield curve & real rate:
    # ... (same pattern as compute_snlr_moi, or add in a separate function)

    df["date"] = pd.to_datetime(df["date"])
    df = add_changes(df)

    # Save main panel
    panel_path = processed_dir / "panel.json"
    df.to_json(panel_path, orient="records", date_format="iso")

    # Save per-tab JSON (simple filter)
    def save_tab(mask, fname):
        df_tab = df[mask].copy()
        df_tab.to_json(processed_dir / fname, orient="records", date_format="iso")

    save_tab(df["metric"].str.contains("hpi|avg_price|teranet", case=False), "prices.json")
    save_tab(df["metric"].isin(["sales", "new_listings", "active_listings", "snlr", "moi"]),
             "sales_listings.json")
    # repeat for other tabs...

if __name__ == "__main__":
    main()

