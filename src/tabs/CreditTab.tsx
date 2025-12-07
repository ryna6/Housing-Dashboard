import React, { useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
import { ChartPanel } from "../components/ChartPanel";
import { useTabData } from "./useTabData";

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
    description:
      "Household non-mortgage credit (consumer credit, lines of credit, etc.).",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    description:
      "Total residential mortgage debt outstanding held by households.",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage share of household credit",
    description:
      "Mortgages as a share of total household credit (mortgage + non-mortgage).",
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
    description:
      "Total credit liabilities of private non-financial corporations.",
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
    description:
      "Leverage ratio for private non-financial corporations (debt / equity).",
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

export function CreditTab() {
  const { data, loading, error } = useTabData("credit");
  const [view, setView] = useState<CreditViewKey>("household");

  const currentCards = view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;

  // Pre-build series per metric from the credit dataset
  const seriesByMetric = useMemo(() => {
    const grouped: Record<string, PanelPoint[]> = {};

    if (!data || data.length === 0) {
      return grouped;
    }

    for (const card of ALL_CARD_CONFIGS) {
      const metricSeries = data.filter((p) => p.metric === card.metricKey);
      grouped[card.metricKey] = trimLastYears(metricSeries, 10);
    }

    return grouped;
  }, [data]);
  return (
    <div className="flex flex-col gap-4">
      {/* Header row: title + subtitle + view selector */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Credit</h2>
          <p className="text-sm text-slate-500">
            Household & business credit, delinquencies, defaults, and stress
            indicators (Statistics Canada, Canadian Mortgage and Housing 
            Corporation, & Innovation Science and Economic Development)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="credit-view"
            className="text-sm text-slate-600 whitespace-nowrap"
          >
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
          <div key={card.metricKey} className="flex flex-col gap-1">
            {card.description && (
              <p className="px-1 text-xs text-slate-500">{card.description}</p>
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
