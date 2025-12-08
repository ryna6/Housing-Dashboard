import React, { useEffect, useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
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
    valueKey: "value",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    valueKey: "value",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage % of credit",
    valueKey: "value",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    // show period-on-period change (MoM / QoQ depending on frequency)
    valueKey: "value",
  },
  {
    metricKey: "household_mortgage_delinquency_rate",
    title: "Mortgage delinquency rate",
    valueKey: "value",
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
    valueKey: "value",
  },
  {
    metricKey: "business_nfc_dsr",
    title: "Business debt service ratio",
    valueKey: "mom_pct",
  },
];

// Where the backend writes the credit panel.
// Credit.py currently writes "panel_credit.json" into data/processed. 
// If you renamed it to "credit.json" in your repo, just change this path.
const CREDIT_DATA_URL = "/data/processed/credit.json";

// -----------------------------------------------------------------------------
// CreditTab component
// -----------------------------------------------------------------------------

export const CreditTab: React.FC = () => {
  const [view, setView] = useState<CreditViewKey>("household");

  const [data, setData] = useState<PanelPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch credit panel JSON once on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(CREDIT_DATA_URL);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!Array.isArray(json)) {
          throw new Error("Expected an array of panel rows");
        }

        if (!cancelled) {
          // panel_credit.json is just a list of PanelRow dicts from Credit.py
          setData(json as PanelPoint[]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load credit data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

      
  function formatCurrencyCompact(value: number): string {
    const abs = Math.abs(value);
    if (!Number.isFinite(value)) return "–";

    if (abs >= 1_000_000_000) {
      return `$${(value / 1_000_000).toFixed(0)}B`;
    }
    if (abs >= 1_000_000) {
      return `$${(value / 1_000).toFixed(0)}M`;
    }
    return `$${value.toFixed(0)}`;
  }

  function formatMoneyTooltip(value: number): string {
    if (!Number.isFinite(value)) return "–";

    const abs = Math.abs(value);
    let scaled = value;
    let suffix = "";

    if (abs >= 1_000_000) {
      scaled = value / 1_000_000;
      suffix = "B";
    } else if (abs >= 1_000) {
      scaled = value / 1_000;
      suffix = "M";
    } 
    return `$${scaled.toFixed(2)}${suffix}`;
  }
  
  // Group rows by metric id so each card can pull its own series
  const seriesByMetric = useMemo(() => {
    const grouped: Record<string, PanelPoint[]> = {};

    for (const row of data) {
      const key = (row as any).metric as string | undefined;
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    return grouped;
  }, [data]);

  const cards = view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Credit</h1>
        <p className="tab__subtitle">
          Household &amp; business credit, delinquencies, defaults, and stress
          indicators (Statistics Canada, Canadian Mortgage and Housing
          Corporation, &amp; Innovation Science and Economic Development)
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

      {error && (
        <div className="tab__error">
          Failed to load credit data: {error}
        </div>
      )}

      {/* Cards grid – 5 cards side by side on desktop */}
      <div className="tab__charts">
        {cards.map((card) => {
          const series = seriesByMetric[card.metricKey] ?? [];

          return (
            <div key={card.metricKey}>
              <ChartPanel
                title={card.title}
                series={series}
                valueKey={card.valueKey ?? "value"}
                // Treat rates / shares / % changes as percent scales
                treatAsPercentScale={
                  card.valueKey === "mom_pct" ||
                  card.valueKey === "yoy_pct" ||
                  card.metricKey.includes("rate") ||
                  card.metricKey.includes("share")
                }
                valueFormatter={formatCurrencyCompact}
                tooltipValueFormatter={formatMoneyTooltip}
                clampYMinToZero
              />
            </div>
          );
        })}
      </div>

      {loading && !error && data.length === 0 && (
        <div className="tab__loading">Loading credit data…</div>
      )}
    </div>
  );
};

export default CreditTab;
