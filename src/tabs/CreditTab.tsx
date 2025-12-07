import React, { useState } from "react";
import { ChartPanel } from "../components/ChartPanel";

type CreditViewKey = "household" | "business";

interface CreditViewOption {
  key: CreditViewKey;
  label: string;
}

interface CreditCardConfig {
  // metric id used in panel_credit.json (from Credit.py)
  metricKey: string;
  title: string;
  // which field from PanelPoint to plot: level vs MoM/QoQ change
  valueKey?: "value" | "mom_pct" | "yoy_pct";
}

// -----------------------------------------------------------------------------
// View options (dropdown)
// -----------------------------------------------------------------------------

const CREDIT_VIEW_OPTIONS: CreditViewOption[] = [
  { key: "household", label: "Households" },
  { key: "business", label: "Businesses" },
];

// -----------------------------------------------------------------------------
// Card configs – metric IDs must line up with Credit.py
// -----------------------------------------------------------------------------

// 1. Household view – 5 cards
const HOUSEHOLD_CARDS: CreditCardConfig[] = [
  {
    metricKey: "household_non_mortgage_loans",
    title: "Non-mortgage loans",
    // levels make more sense here
    valueKey: "value",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    valueKey: "value",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage share of household credit",
    valueKey: "value",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    // show period-on-period change (MoM / QoQ depending on frequency)
    valueKey: "mom_pct",
  },
  {
    metricKey: "household_mortgage_delinquency_rate",
    title: "Mortgage delinquency rate",
    valueKey: "mom_pct",
  },
];

// 2. Business view – 5 cards
const BUSINESS_CARDS: CreditCardConfig[] = [
  {
    metricKey: "business_total_debt",
    title: "Total business debt",
    valueKey: "value",
  },
  {
    metricKey: "business_equity",
    title: "Total business equity",
    valueKey: "value",
  },
  {
    metricKey: "business_debt_to_equity",
    title: "Debt-to-equity ratio",
    valueKey: "value",
  },
  {
    metricKey: "business_default_rate",
    title: "Business default rate",
    valueKey: "mom_pct",
  },
  {
    metricKey: "business_nfc_dsr",
    title: "Business delinquency rate",
    valueKey: "mom_pct",
  },
];

// -----------------------------------------------------------------------------
// CreditTab component
// -----------------------------------------------------------------------------

export const CreditTab: React.FC = () => {
  const [view, setView] = useState<CreditViewKey>("household");

  const cards = view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Credit</h1>
        <p className="tab__subtitle">
          Household & business credit, delinquencies, defaults, and stress
          indicators (Statistics Canada, Canadian Mortgage and Housing
          Corporation, & Innovation Science and Economic Development)
        </p>
      </header>

      <div className="tab__controls">
        <div className="tab__regions-group">
          <span className="tab__regions-label">View:</span>
          <select
            id="credit-view"
            className="tab__regions-select"
            value={view}
            onChange={(e) => setView(e.target.value as CreditViewKey)}
          >
            {CREDIT_VIEW_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards grid – 5 cards side by side on desktop */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {cards.map((card) => (
          <div key={card.metricKey}>
            <ChartPanel
              title={card.title}
              // TODO: wire up real series for card.metricKey.
              // For now, pass an empty series so ChartPanel renders its "no data" state.
              series={[]}
              valueKey={card.valueKey ?? "value"}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreditTab;
