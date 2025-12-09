import React, { useEffect, useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
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
    title: "Mortgage % of household credit",
    valueKey: "value",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    // show level (not percentage)
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
    valueKey: "value",
  },
];

// Where the backend writes the credit panel.
const CREDIT_DATA_URL = "/data/processed/credit.json";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Metrics whose values are in units of 1,000,000 (e.g. 800,000 → 800B)
// We rescale them to the “real” dollar value for charts & cards.
function metricUsesMillionUnits(metricKey: string): boolean {
  return (
    metricKey === "household_non_mortgage_loans" ||
    metricKey === "household_mortgage_loans" ||
    metricKey === "business_total_debt" ||
    metricKey === "business_equity"
  );
}

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

    if (abs >= 1_000_000_000_000) {
      return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
    }
    if (abs >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(0)}B`;
    }
    if (abs >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(0)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(0)}K`;
    }
    return `$${value.toFixed(2)}`;
  }

  function formatMoneyTooltip(value: number): string {
    if (!Number.isFinite(value)) return "–";

    const abs = Math.abs(value);
    let scaled = value;
    let suffix = "";

    if (abs >= 1_000_000_000_000) {
      return `$${(value / 1_000_000_000_000).toFixed(3)}T`;
    }
    if (abs >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (abs >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`;
    }
    return `${value.toFixed(1)}`;
  }

  // Group rows by metric id so each card can pull its own series
  const { seriesByMetric, snapshotsByMetric } = useMemo(() => {
    const byMetric: Record<string, PanelPoint[]> = {};
    const snapshots: Record<string, MetricSnapshot> = {};

    for (const row of data) {
      const metric = (row as any).metric as string | undefined;
      if (!metric) continue;
      if (!byMetric[metric]) byMetric[metric] = [];

      // 1) Scale million-unit metrics so both charts and cards use true values
      const scaledRow =
        metricUsesMillionUnits(metric) && typeof (row as any).value === "number"
          ? ({
              ...row,
              value: ((row as any).value as number) * 1_000_000,
              unit: "cad",
            } as PanelPoint)
          : row;

      byMetric[metric].push(scaledRow);
    }

    for (const [metric, rows] of Object.entries(byMetric)) {
      const sorted = rows
        .slice()
        .sort((a, b) => {
          const da = (a as any).date ?? "";
          const db = (b as any).date ?? "";
          if (da < db) return -1;
          if (da > db) return 1;
          return 0;
        });

      const latest = sorted[sorted.length - 1];
      const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

      // latest / prev already use the scaled values where applicable
      snapshots[metric] = {
        metric,
        latest,
        prev,
      };
    }

    return { seriesByMetric: byMetric, snapshotsByMetric: snapshots };
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

      {/* Snapshot cards */}
      <div className="tab__metrics">
        {cards.map((card) => {
          const snapshot = snapshotsByMetric[card.metricKey];

          if (!snapshot) {
            return (
              <div
                key={card.metricKey}
                className="metric-card metric-card--empty"
              >
                <div className="metric-card__title">{card.title}</div>
                <div className="metric-card__empty-text">
                  Not available for this selection.
                </div>
              </div>
            );
          }

          return (
            <MetricSnapshotCard
              key={card.metricKey}
              snapshot={snapshot}
              titleOverride={card.title}
            />
          );
        })}
      </div>

      {/* Charts grid – 5 cards side by side on desktop */}
      <div className="tab__charts tab__metrics--wide">
        {cards.map((card) => {
          const series = seriesByMetric[card.metricKey] ?? [];
          const valueKey = card.valueKey ?? "value";

          // Default percent handling based on key/value
          let treatAsPercentScale =
            valueKey === "mom_pct" ||
            valueKey === "yoy_pct" ||
            card.metricKey.includes("rate") ||
            card.metricKey.includes("share");

          let valueFormatter = formatCurrencyCompact;
          let tooltipValueFormatter = formatMoneyTooltip;

          // 1) Debt-to-equity ratio: plain ratio, no currency, no %
          if (card.metricKey === "business_debt_to_equity") {
           treatAsPercentScale = false;
           valueFormatter = (v: number) =>
             Number.isFinite(v) ? v.toFixed(2) : "–";
           tooltipValueFormatter = (v: number) =>
             Number.isFinite(v) ? v.toFixed(2) : "–";
          }


          // 2) Household default rate: no percentage units
          if (card.metricKey === "household_default_rate") {
            treatAsPercentScale = false;
            valueFormatter = (v) =>
              Number.isFinite(v) ? `${v.toFixed(2)}%` : "–";
            tooltipValueFormatter = (v) =>
              Number.isFinite(v) ? `${v.toFixed(2)}%` : "–";
             }

          // 3) Mortgage delinquency rate: small percentages with proper decimals
          if (card.metricKey === "household_mortgage_delinquency_rate") {
            treatAsPercentScale = false;
            valueFormatter = (v: number) =>
              Number.isFinite(v) ? v.toFixed(2) : "–";
            tooltipValueFormatter = (v: number) =>
              Number.isFinite(v) ? v.toFixed(2) : "–";
          }

          return (
            <div key={card.metricKey}>
              <ChartPanel
                title={card.title}
                series={series}
                valueKey={valueKey}
                // Treat rates / shares / % changes as percent scales, unless
                // overridden above for specific metrics.
                treatAsPercentScale={treatAsPercentScale}
                valueFormatter={valueFormatter}
                tooltipValueFormatter={tooltipValueFormatter}
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
