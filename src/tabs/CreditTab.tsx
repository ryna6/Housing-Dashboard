import React, { useMemo, useState } from "react";
import type { PanelPoint, TabSeries } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

/**
 * Metrics available in data/processed/credit.json
 * (keep this in sync with credit.py)
 */
export type CreditMetricKey =
  | "household_non_mortgage_loans"
  | "household_mortgage_loans"
  | "household_mortgage_share_of_credit"
  | "household_default_rate"
  | "household_mortgage_delinquency_rate"
  | "business_total_debt"
  | "business_equity"
  | "household_mortgage_share_of_credit"
  | "business_default_rate"
  | "business_nfc_dsr";

export type CreditViewKey = "household" | "business";

interface CreditCardDefinition {
  metricKey: CreditMetricKey;
  title: string;
  description: string;
  unit: string;
  view: CreditViewKey;
  /** Which field from PanelPoint to chart; defaults to "value" */
  valueKey?: keyof PanelPoint;
}

const CREDIT_VIEW_OPTIONS: { key: CreditViewKey; label: string }[] = [
  { key: "household", label: "Households" },
  { key: "business", label: "Businesses" },
];

/**
 * 1. Household view – 5 cards
 */
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
    title: "Mortgage % of household credit",
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

/**
 * Helper to look up card meta by metric key.
 */
function findCard(metricKey: CreditMetricKey): CreditCardDefinition | undefined {
  return (
    HOUSEHOLD_CARDS.find((c) => c.metricKey === metricKey) ??
    BUSINESS_CARDS.find((c) => c.metricKey === metricKey)
  );
}

/**
 * Convert filtered rows from credit.json into a TabSeries
 * for ChartPanel.
 */
function buildSeriesForMetric(
  data: any[],
  metricKey: CreditMetricKey,
  region = "Canada",
  segment = "All",
): TabSeries[] {
  const card = findCard(metricKey);

  const points: PanelPoint[] = data
    .filter(
      (row) =>
        row.region === region &&
        row.segment === segment &&
        row.metric === metricKey,
    )
    .map((row) => ({
      date: row.date,
      value: Number(row.value),
      mom_pct:
        row.mom_pct === undefined || row.mom_pct === null
          ? null
          : Number(row.mom_pct),
      yoy_pct:
        row.yoy_pct === undefined || row.yoy_pct === null
          ? null
          : Number(row.yoy_pct),
      ma3:
        row.ma3 === undefined || row.ma3 === null ? null : Number(row.ma3),
    }));

  return [
    {
      id: metricKey,
      label: card?.title ?? metricKey,
      unit: card?.unit,
      points,
    },
  ];
}

export const CreditTab: React.FC = () => {
  // 1. Load data for this tab – this is what triggers the /data/processed/credit.json fetch
  const { data, loading, error } = useTabData("credit");

  // For now your backend only has Canada / All
  const region = "Canada";
  const segment = "All";

  const [view, setView] = useState<CreditViewKey>("household");
  const cards = view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;

  const snapshots = useMemo(
    () =>
      cards.map((card) => ({
        card,
        latest: data
          ? getLatestByMetric(data, card.metricKey, { region, segment })
          : undefined,
      })),
    [cards, data, region, segment],
  );

  if (loading) {
    return <div className="tab__status">Loading credit data…</div>;
  }

  if (error) {
    return (
      <div className="tab__status tab__status--error">
        Failed to load credit data. Please try again later.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="tab__status">
        No credit data available for the selected view.
      </div>
    );
  }

  return (
    <div className="tab">
      <header className="tab__header">
        <div>
          <h1 className="tab__title">Credit</h1>
          <p className="tab__subtitle">
            Household and business credit, default rates, delinquency and
            debt-service ratios.
          </p>
        </div>

        <div className="tab__controls">
          <label className="tab__control">
            <span className="tab__control-label">View</span>
            <select
              className="tab__select"
              value={view}
              onChange={(e) => setView(e.target.value as CreditViewKey)}
            >
              {CREDIT_VIEW_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Top cards – latest snapshot values */}
      <section className="tab__cards">
        {snapshots.map(({ card, latest }) => (
          <MetricSnapshotCard
            key={card.metricKey}
            title={card.title}
            unit={card.unit}
            latest={latest}
            helpText={card.description}
          />
        ))}
      </section>

      {/* Charts – full time series for each metric */}
      <section className="tab__charts">
        {cards.map((card) => (
          <ChartPanel
            key={card.metricKey}
            title={card.title}
            helpText={card.description}
            unit={card.unit}
            valueKey={card.valueKey ?? "value"}
            series={buildSeriesForMetric(
              data ?? [],
              card.metricKey,
              region,
              segment,
            )}
          />
        ))}
      </section>
    </div>
  );
};
