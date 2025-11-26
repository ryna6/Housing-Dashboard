import pandas as pd

def add_changes(df: pd.DataFrame) -> pd.DataFrame:
    """
    df is long panel with cols:
      date (datetime64), region, segment, metric, value
    Returns df with mom_pct, yoy_pct, ma3.
    """
    df = df.sort_values(["metric", "region", "segment", "date"])
    grouped = df.groupby(["metric", "region", "segment"], group_keys=False)

    def _with_changes(g: pd.DataFrame) -> pd.DataFrame:
        g = g.copy()
        g["value_lag1"] = g["value"].shift(1)
        g["value_lag12"] = g["value"].shift(12)
        g["mom_pct"] = (g["value"] / g["value_lag1"] - 1.0) * 100.0
        g["yoy_pct"] = (g["value"] / g["value_lag12"] - 1.0) * 100.0
        g["ma3"] = g["value"].rolling(3).mean()
        return g

    df = grouped.apply(_with_changes)
    return df.drop(columns=["value_lag1", "value_lag12"], errors="ignore")


def compute_snlr_moi(df: pd.DataFrame) -> pd.DataFrame:
    # SNLR and MOI share date/region/segment
    pivot = (
        df.pivot_table(
            index=["date", "region", "segment"],
            columns="metric",
            values="value",
        )
        .reset_index()
    )

    if "sales" in pivot.columns and "new_listings" in pivot.columns:
        pivot["snlr"] = pivot["sales"] / pivot["new_listings"]

    if "sales" in pivot.columns and "active_listings" in pivot.columns:
        pivot["moi"] = pivot["active_listings"] / pivot["sales"].replace({0: pd.NA})

    long_extra = pivot.melt(
        id_vars=["date", "region", "segment"],
        value_vars=[c for c in ["snlr", "moi"] if c in pivot.columns],
        var_name="metric",
        value_name="value",
    )
    long_extra["unit"] = "ratio"
    long_extra["source"] = "derived"

    return pd.concat([df, long_extra], ignore_index=True)

