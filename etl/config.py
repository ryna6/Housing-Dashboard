from dataclasses import dataclass

REGIONS = ["canada", "on", "bc", "gta", "metro_vancouver"]
SEGMENTS = ["all", "condo", "freehold"]


@dataclass
class BocSeriesConfig:
    series: str   # BoC Valet series code
    metric: str   # MetricId
    unit: str     # "pct" etc.


BOC_SERIES: list[BocSeriesConfig] = [
    BocSeriesConfig("V39079", "policy_rate", "pct"),
    BocSeriesConfig("V39051", "mortgage_5y", "pct"),
    # Add 2y / 5y / 10y GoC yields (series codes may change – configure here)
    BocSeriesConfig("V39046", "gov_2y_yield", "pct"),
    BocSeriesConfig("V39055", "gov_5y_yield", "pct"),
    BocSeriesConfig("V39056", "gov_10y_yield", "pct"),
]


TAB_FILES = {
    "prices": "prices.json",
    "sales_listings": "sales_listings.json",
    "supply_pipeline": "supply_pipeline.json",
    "rates_bonds": "rates_bonds.json",
    "inflation_labour": "inflation_labour.json",
    "credit_stress": "credit_stress.json",
    "market_risk": "market_risk.json",
    "rentals": "rentals.json",
}

TAB_METRICS = {
    "prices": ["hpi_benchmark", "avg_price", "teranet_hpi"],
    "sales_listings": ["sales", "new_listings", "active_listings", "snlr", "moi"],
    "supply_pipeline": ["starts", "completions", "under_construction", "permits"],
    "rates_bonds": [
        "policy_rate",
        "mortgage_5y",
        "gov_2y_yield",
        "gov_5y_yield",
        "gov_10y_yield",
        "mortgage_5y_spread",
    ],
    "inflation_labour": [
        "cpi_headline",
        "cpi_shelter",
        "cpi_rent",
        "wage_index",
        "unemployment_rate",
    ],
    "credit_stress": [
        "insolvencies",
        "bankruptcies",
        "mortgage_arrears",
        "consumer_delinquency",
    ],
    "market_risk": ["tsx_index", "hy_spread", "risk_composite"],
    "rentals": ["avg_rent", "rent_index", "vacancy_rate", "rent_inflation"],
}
