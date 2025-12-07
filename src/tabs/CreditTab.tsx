import React, { useState } from "react";
// Adjust these imports to match your project structure
import { ChartPanel } from "../components/ChartPanel";
import type { TabKey } from "./tabConfig";

// If you have a TabKey enum that includes Credit, you can keep this.
// Otherwise you can remove TabKey usage entirely in this file.
const CREDIT_TAB_KEY: TabKey = "credit" as TabKey;

type CreditViewKey = "household" | "business";

interface CreditViewOption {
  key: CreditViewKey;
  label: string;
}

interface CreditCardConfig {
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
// Card configs – metric IDs must line up with credit.py
// -----------------------------------------------------------------------------

// 1. Household view – 5 cards
const HOUSEHOLD_CARDS: CreditCardConfig[] = [
  {
    metricKey: "household_non_mortgage_loans",
    title: "Non-mortgage loans",
    description: "Household non-mortgage credit (consumer credit, lines of credit, etc.).",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    description: "Total residential mortgage debt outstanding held by households.",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage share of household credit",
    description: "Mortgages as a share of total household credit (mortgage + non-mortgage).",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    description:
      "Consumer insolvency counts (bankruptcies + proposals), used as a proxy for household credit defaults.",
  },
  {
    metricKey: "household_mortgage_delinquency_rate",
    title: "Mortgage delinquency rate",
    description:
      "Share of residential mortgages that are 90+ days in arrears (quarterly, CMHC).",
  },
];

// 2. Business view – 5 cards
const BUSINESS_CARDS: CreditCardConfig[] = [
  {
    metricKey: "business_total_debt",
    title: "Total business debt",
    description: "Total credit liabilities of private non-financial corporations.",
  },
  {
    metricKey: "business_equity",
    title: "Business equity",
    description:
      "Equity liabilities of private non-financial corporations (approx. equity securities component).",
  },
  {
    metricKey: "business_debt_to_equity",
    title: "Debt-to-equity ratio",
    description: "Leverage ratio for private non-financial corporations (debt / equity).",
  },
  {
    metricKey: "business_default_rate",
    title: "Business default rate",
    description:
      "Business insolvency counts (bankruptcies + proposals), used as a proxy for corporate defaults.",
  },
  {
    metricKey: "business_nfc_dsr",
    title: "Non-financial corporate DSR",
    description:
      "Debt service ratio for non-financial corporations: share of income used to service debt (BIS, quarterly).",
  },
];

// -----------------------------------------------------------------------------
// CreditTab component
// -----------------------------------------------------------------------------

export const CreditTab: React.FC = () => {
  const [view, setView] = useState<CreditViewKey>("household");

  const cards = view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: title + view selector */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Credit</h2>
          <p className="text-sm text-slate-500">
            Explore household and business credit, defaults, and stress indicators
            over the past 10 years.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="credit-view" className="text-sm text-slate-600">
            View
          </label>
          <select
            id="credit-view"
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
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
          <ChartPanel
            key={card.metricKey}
            // NOTE: adjust these prop names to match your actual ChartPanel API.
            tabKey={CREDIT_TAB_KEY}
            metricKey={card.metricKey}
            title={card.title}
            description={card.description}
          />
        ))}
      </div>
    </div>
  );
};

export default CreditTab;
