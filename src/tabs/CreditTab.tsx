import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

type CreditView = "household" | "business" | "corporate";

const VIEW_OPTIONS: { value: CreditView; label: string }[] = [
  { value: "household", label: "Household" },
  { value: "business", label: "Business" },
  { value: "corporate", label: "Corporate Debt" },
];

// Canada aggregate only for this tab
const REGION: RegionCode = "canada";

const CARD_TITLES: Record<string, string> = {
  // Household
  household_non_mortgage_loans: "Household non-mortgage loans",
  household_mortgage_loans: "Household mortgage loans",
  household_mortgage_share: "Mortgage share of household credit",
  household_loc: "Household lines of credit",
  // Business
  business_non_mortgage_loans: "Business non-mortgage loans",
  business_mortgage_loans: "Business mortgage loans",
  business_loans_share: "Business loans share of credit",
  business_debt_securities: "Business debt securities",
  // Corporate
  corp_debt_securities: "Corporate debt securities",
  corp_equity_securities: "Corporate equity securities",
  corp_credit_total: "Total corporate credit liabilities",
  corp_debt_to_equity: "Debt-to-equity ratio",
};

type CreditMetricConfig = {
  metric: string;
  title: string;
  treatAsPercent?: boolean;
  useCurrencyFormatter?: boolean;
};

const CREDIT_METRIC_CONFIGS: Record<CreditView, CreditMetricConfig[]> = {
  household: [
    {
      metric: "household_non_mortgage_loans",
      title: "Household non-mortgage loans",
      useCurrencyFormatter: true,
    },
    {
      metric: "household_mortgage_loans",
      title: "Household mortgage loans",
      useCurrencyFormatter: true,
    },
    {
      metric: "household_mortgage_share",
      title: "Mortgage % of household credit",
      treatAsPercent: true,
    },
    {
      metric: "household_loc",
      title: "Household lines of credit",
      useCurrencyFormatter: true,
    },
  ],
  business: [
    {
      metric: "business_non_mortgage_loans",
      title: "Business non-mortgage loans",
      useCurrencyFormatter: true,
    },
    {
      metric: "business_mortgage_loans",
      title: "Business mortgage loans",
      useCurrencyFormatter: true,
    },
    {
      metric: "business_loans_share",
      title: "Business loans % of business credit",
      treatAsPercent: true,
    },
    {
      metric: "business_debt_securities",
      title: "Business debt securities",
      useCurrencyFormatter: true,
    },
  ],
  corporate: [
    {
      metric: "corp_debt_securities",
      title: "Corporate debt securities",
      useCurrencyFormatter: true,
    },
    {
      metric: "corp_equity_securities",
      title: "Corporate equity securities",
      useCurrencyFormatter: true,
    },
    {
      metric: "corp_credit_total",
      title: "Total corporate credit liabilities",
      useCurrencyFormatter: true,
    },
    {
      metric: "corp_debt_to_equity",
      title: "Debt-to-equity ratio",
    },
  ],
};

/**
 * Trim a time series down to the last N calendar years,
 * preserving ordering and all recent data.
 */
function trimLastYears(series: PanelPoint[], years: number): PanelPoint[] {
  if (series.length <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return sorted.filter((p) => {
    const d = new Date(p.date);
    return d >= cutoff;
  });
}

/**
 * Compact currency formatter for large CAD series on charts
 * (cards rely on MetricSnapshotCard's internal formatting).
 */
function formatCurrencyBillions(value: number): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) return "–";

  if (abs >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(0)}B`;
  }
  return `$${value.toFixed(0)}`;
}

function formatMoneyTooltip(value: number): string {
  if (!Number.isFinite(value)) return "–";

  const abs = Math.abs(value);
  let scaled = value;
  let suffix = "";

  if (abs >= 1_000_000_000_000) {
    scaled = value / 1_000_000_000_000;
    suffix = "T";
  } else if (abs >= 1_000_000_000) {
    scaled = value / 1_000_000_000;
    suffix = "B";
  } 
  return `$${scaled.toFixed(2)}${suffix}`;
}

function getSegmentForView(view: CreditView): string {
  if (view === "household") return "household";
  if (view === "business") return "business";
  return "corporate";
}

function getSnapshotsForView(
  data: PanelPoint[],
  view: CreditView
): MetricSnapshot[] {
  if (!data.length) return [];

  const segment = getSegmentForView(view);
  const metrics = CREDIT_METRIC_CONFIGS[view].map((cfg) => cfg.metric);

  return getLatestByMetric(data, REGION, metrics, segment);
}

function buildSeriesForView(
  data: PanelPoint[],
  view: CreditView,
  years: number
): { config: CreditMetricConfig; series: PanelPoint[] }[] {
  const segment = getSegmentForView(view);
  const configs = CREDIT_METRIC_CONFIGS[view];

  return configs.map((config) => {
    const filtered = data.filter(
      (p) =>
        p.region === REGION &&
        p.segment === segment &&
        p.metric === config.metric
    );
    return {
      config,
      series: trimLastYears(filtered, years),
    };
  });
}

export const CreditTab: React.FC = () => {
  const { data, loading, error } = useTabData("credit");
  const [view, setView] = useState<CreditView>("household");

  const snapshots = useMemo(
    () => getSnapshotsForView(data, view),
    [data, view]
  );

  const seriesForCharts = useMemo(
    () => buildSeriesForView(data, view, 10),
    [data, view]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Credit</h1>
        <p className="tab__subtitle">
          Household, business, and corporate credit & debt (Statistics Canada)
        </p>

        <div className="tab__controls tab__controls--inline">
  <div className="tab__segment tab__segment--left">
    <span>View:</span>
    <select
      value={view}
      onChange={(e) => setView(e.target.value as CreditView)}
      className="tab__regions-select"
    >
      {VIEW_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
</div>
      </header>

      {loading && <div className="tab__status">Loading credit data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load credit data: {error}
        </div>
      )}

      {/* Four headline cards for the selected view */}
      <section className="tab__metrics">
        {!loading && !error && !snapshots.length && (
          <div className="tab__status">
            No credit data available for this view yet.
          </div>
        )}
        {snapshots.map((snapshot) => (
          <MetricSnapshotCard
            key={snapshot.metric}
            snapshot={snapshot}
            titleOverride={CARD_TITLES[snapshot.metric] ?? undefined}
          />
        ))}
      </section>

      {/* Level charts for the selected view (last ~10 years) */}
      <section className="tab__charts">
        {seriesForCharts.map(({ config, series }) => (
          <ChartPanel
            key={config.metric}
            title={config.title}
            series={series}
            valueKey="value"
            valueFormatter={
              config.useCurrencyFormatter ? formatCurrencyBillions : undefined
            }
            treatAsPercentScale={config.treatAsPercent}
            tooltipValueFormatter={formatMoneyTooltip}
            clampYMinToZero
          />
        ))}
      </section>
    </div>
  );
};
