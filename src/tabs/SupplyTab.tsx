// src/tabs/SupplyTab.tsx
import React, { useMemo } from "react";
import type { PanelPoint, RegionCode, Segment } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

// Metrics exposed by the Supply tab – all Canada aggregate, segment "all"
const SUPPLY_METRICS: string[] = [
  "housing_starts",
  "under_construction",
  "completions",
  "investment_construction",
  "vacancy_rate",
];

const REGION: RegionCode = "canada";
const SEGMENT: Segment = "all";

/**
 * Compact formatter for counts used on charts, e.g.
 *  - 100000 -> "100K"
 *  - 1000000 -> "1.0M"
 */
function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

/**
 * Compact currency formatter for charts, e.g. $100K, $1.2M, $18.2B.
 * (Assumes values are in dollars – backend can decide whether to scale.)
 */
function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

const CARD_TITLES: Record<string, string> = {
  housing_starts: "Housing starts",
  under_construction: "Under construction",
  completions: "Completions",
  investment_construction: "Construction investment",
  vacancy_rate: "Rental vacancy rate",
};

export const SupplyTab: React.FC = () => {
  const { data, loading, error } = useTabData("supply");

  // Latest reading for each of the five overview metrics
  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, SUPPLY_METRICS, SEGMENT),
    [data]
  );

  // One time series per metric, filtered to Canada / all segments
  const housingStartsSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "housing_starts" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const underConstructionSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "under_construction" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const completionsSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "completions" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const investmentSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "investment_construction" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const vacancySeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "vacancy_rate" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Supply</h1>
        <p className="tab__subtitle">
          Housing starts, under-construction, completions, residential construction investment, and rental vacancy rate (Canada Mortgage and Housing Corporation & Statistics Canada)
        </p>
      </header>

      {loading && <div className="tab__status">Loading supply data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load supply data: {error}
        </div>
      )}

      {/* Five overview cards in a single row on desktop */}
      <section className="tab__metrics tab__metrics--wide">
        {!loading && !snapshots.length && !error && (
          <div className="tab__status">No supply data available yet.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard
            key={s.metric}
            snapshot={s}
            titleOverride={CARD_TITLES[s.metric] ?? undefined}
          />
        ))}
      </section>

      {/* Level charts – one per metric */}
      <section className="tab__charts">
        <ChartPanel
          title="Housing starts"
          series={housingStartsSeries}
          valueKey="value"
          valueFormatter={formatCompactCount}
          clampYMinToZero
        />
        <ChartPanel
          title="Under construction"
          series={underConstructionSeries}
          valueKey="value"
          valueFormatter={formatCompactCount}
          clampYMinToZero
        />
        <ChartPanel
          title="Completions"
          series={completionsSeries}
          valueKey="value"
          valueFormatter={formatCompactCount}
          clampYMinToZero
        />
        <ChartPanel
          title="Construction investment"
          series={investmentSeries}
          valueKey="value"
          valueFormatter={formatCompactCurrency}
          clampYMinToZero
        />
        <ChartPanel
          title="Rental vacancy rate"
          series={vacancySeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
