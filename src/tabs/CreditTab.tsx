import React, { useMemo, useState } from "react";
import type { PanelPoint, TabSeries } from "../data/types";
import {
  MetricSnapshotCard,
  type MetricSnapshot,
} from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { useTabData } from "./useTabData";

/** All metric ids used in panel_credit.json */
export type CreditMetricKey =
  | "household_non_mortgage_loans"
  | "household_mortgage_loans"
  | "household_mortgage_share_of_credit"
  | "household_default_rate"
  | "household_mortgage_delinquency_rate"
  | "business_total_debt"
  | "business_equity"
  | "business_debt_to_equity"
  | "business_default_rate"
  | "business_nfc_dsr";

type CreditViewKey = "household" | "business";

interface CreditViewOption {
  key: CreditViewKey;
  label: string;
  description: string;
}

const CREDIT_VIEW_OPTIONS: CreditViewOption[] = [
  { key: "household", label: "Households", },
  { key: "business", label: "Businesses", },
];

interface CreditCardDefinition {
  metricKey: CreditMetricKey;
  title: string;
  unit?: string;
}

/** Household view – 5 cards */
const HOUSEHOLD_CARDS: CreditCardDefinition[] = [
  {
    metricKey: "household_non_mortgage_loans",
    title: "Non-mortgage loans",
    unit: "C$ billions",
  },
  {
    metricKey: "household_mortgage_loans",
    title: "Mortgage loans",
    unit: "C$ billions",
  },
  {
    metricKey: "household_mortgage_share_of_credit",
    title: "Mortgage share of household credit",
    unit: "%",
  },
  {
    metricKey: "household_default_rate",
    title: "Household default rate",
    unit: "%",
  },
  {
    metricKey: "household_mortgage_delinquency_rate",
    title: "Mortgage delinquency rate",
    unit: "%",
  },
];

/** Business view – 5 cards */
const BUSINESS_CARDS: CreditCardDefinition[] = [
  {
    metricKey: "business_total_debt",
    title: "Total business debt",
    unit: "C$ billions",
  },
  {
    metricKey: "business_equity",
    title: "Business equity",
    unit: "C$ billions",
  },
  {
    metricKey: "business_debt_to_equity",
    title: "Debt-to-equity ratio",
    unit: "ratio",
  },
  {
    metricKey: "business_default_rate",
    title: "Business default rate",
    unit: "%",
  },
  {
    metricKey: "business_nfc_dsr",
    title: "Business debt service ratio",
    unit: "ratio",
  },
];

function getCardsForView(view: CreditViewKey): CreditCardDefinition[] {
  return view === "household" ? HOUSEHOLD_CARDS : BUSINESS_CARDS;
}

interface CreditCardSnapshot {
  card: CreditCardDefinition;
  snapshot: MetricSnapshot;
}

/**
 * Build card snapshots (latest + previous point) for a given view.
 * We don’t filter by region/segment here because credit data is Canada-wide
 * in panel_credit.json.
 */
function buildSnapshotsForView(
  view: CreditViewKey,
  data: PanelPoint[]
): CreditCardSnapshot[] {
  const cards = getCardsForView(view);

  return cards
    .map((card) => {
      const points = data
        .filter((p) => p.metric === card.metricKey)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!points.length) {
        return null;
      }

      const latest = points[points.length - 1];
      const prev = points.length > 1 ? points[points.length - 2] : null;

      const snapshot: MetricSnapshot = {
        metric: card.metricKey,
        latest,
        prev,
      };

      return { card, snapshot };
    })
    .filter((entry): entry is CreditCardSnapshot => entry !== null);
}

/**
 * Build chart series for the current view – one series per metric
 * (e.g. 5 lines for the household view).
 */
function buildSeriesForView(
  view: CreditViewKey,
  data: PanelPoint[]
): TabSeries[] {
  const cards = getCardsForView(view);

  return cards
    .map((card) => {
      const points = data
        .filter((p) => p.metric === card.metricKey)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!points.length) return null;

      const series: TabSeries = {
        id: card.metricKey,
        label: card.title,
        unit: card.unit,
        points,
      };

      return series;
    })
    .filter((s): s is TabSeries => s !== null);
}

export const CreditTab: React.FC = () => {
  const { data, loading, error } = useTabData("credit");
  const [view, setView] = useState<CreditViewKey>("household");

  const viewOption = CREDIT_VIEW_OPTIONS.find((o) => o.key === view)!;

  const cardSnapshots = useMemo(
    () => buildSnapshotsForView(view, data),
    [view, data]
  );

  const series = useMemo(
    () => buildSeriesForView(view, data),
    [view, data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <div>
          <h1 className="tab__title">Credit</h1>
          <p className="tab__subtitle">
            Household & business credit, delinquencies, defaults, and stress indicators (Statistics Canada, 
            Canadian Mortgage and Housing Corporation, & Innovation Science and Economic Development)
          </p>
        </div>

        <div className="tab__controls">
          <div
            className="segmented-control"
            role="tablist"
            aria-label="Credit view"
          >
            {CREDIT_VIEW_OPTIONS.map((option) => {
              const isActive = option.key === view;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`segmented-control__option${
                    isActive ? " segmented-control__option--active" : ""
                  }`}
                  onClick={() => setView(option.key)}
                >
                  <span className="segmented-control__label">
                    {option.label}
                  </span>
                  <span className="segmented-control__description">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {error && (
        <div className="tab__status tab__status--error">
          Failed to load credit data. {error}
        </div>
      )}

      <main className="tab__content">
        {/* Cards */}
        <section className="tab__metrics tab__metrics--3col">
          {!loading && !cardSnapshots.length && (
            <div className="tab__status">
              No credit data available for this view yet.
            </div>
          )}

          {cardSnapshots.map(({ card, snapshot }) => (
            <MetricSnapshotCard
              key={card.metricKey}
              snapshot={snapshot}
              titleOverride={card.title}
            />
          ))}
        </section>

        {/* Chart */}
        <section className="tab__charts">
          <ChartPanel
            title={
              view === "household"
                ? "Household credit & quality"
                : "Business credit & quality"
            }
            description={viewOption.description}
            loading={loading}
            unit={undefined}
            series={series}
            valueKey="value"
          />
        </section>
      </main>
    </div>
  );
};
