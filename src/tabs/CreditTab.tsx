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
  description?: string;
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
    description: "Household non-mortgage credit",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    description: "Household mortgage debt",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage share of household credit",
    description: "Mortgages share of total household credit",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    description: "Consumer default rate.",
  },
  {
    metricKey: "household_mortgage_delinquency_rate",
    title: "Mortgage delinquency rate",
    description: "Mortgage delinquency rate",
  },
];

// 2. Business view – 5 cards
const BUSINESS_CARDS: CreditCardConfig[] = [
  {
    metricKey: "business_total_debt",
    title: "Total business debt",
    description: "Total credit liabilities of businesses",
  },
  {
    metricKey: "business_equity",
    title: "Business equity",
    description: "Equity liabilities of businesses",
  },
  {
    metricKey: "business_debt_to_equity",
    title: "Debt-to-equity ratio",
    description: "Debt to equity ratio",
  },
  {
    metricKey: "business_default_rate",
    title: "Business default rate",
    description: "Business default rate",
  },
  {
    metricKey: "business_nfc_dsr",
    title: "Non-financial corporate DSR",
    description: "Debt service ratio for businesses",
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
          <label className="tab__regions-select" htmlFor="credit-view">
            View
          </label>
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

      {/* Cards grid – 5 cards, responsive layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.metricKey} className="flex flex-col gap-1">
            {card.description && (
              <p className="text-xs text-slate-500 px-1">
                {card.description}
              </p>
            )}
            <ChartPanel
              title={card.title}
              // TODO: wire up real series for card.metricKey.
              // For now, pass an empty series so ChartPanel renders its "no data" state.
              series={[]}
              valueKey="value"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreditTab;
