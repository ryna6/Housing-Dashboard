import React, { useMemo } from "react";
import type { PanelPoint, RegionCode, Segment } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const SALES_METRICS: string[] = [
  "new_listings",
  "active_listings",
  "snlr",
  "moi",
  "absorption_rate",
];

// Sales tab is Canada aggregate only, no region / segment selector in the UI
const REGION: RegionCode = "canada";
const SEGMENT: Segment = "all";

/**
 * Compact formatter for counts used on charts, e.g.
 *  - 100000 -> "100K"
 *  - 1000000 -> "1.0M"
 */
function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) return "–";
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

const CARD_TITLES: Record<string, string> = {
  new_listings: "New Listings",
  active_listings: "Active Listings",
  snlr: "SNLR",
  moi: "MOI",
  absorption_rate: "Absorption Rate",
};

export const SalesListingsTab: React.FC = () => {
  const { data, loading, error } = useTabData("sales_listings");

  // Latest reading for each of the five overview metrics
  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, SALES_METRICS, SEGMENT),
    [data]
  );

  // One time series per metric, filtered to Canada / all segments
  const newListingsSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "new_listings" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const activeListingsSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "active_listings" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  const snlrSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) => p.metric === "snlr" && p.region === REGION && p.segment === SEGMENT
      ),
    [data]
  );

  const moiSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) => p.metric === "moi" && p.region === REGION && p.segment === SEGMENT
      ),
    [data]
  );

  const absorptionRateSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "absorption_rate" &&
          p.region === REGION &&
          p.segment === SEGMENT
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Sales & Listings</h1>
        <p className="tab__subtitle">
          New and active listings, sales-to-new listings ratio (SNLR), months of
          inventory (MOI), and absorption rate (Canadian Real Estate Association & Statistics Canada)
        </p>
      </header>

      {loading && (
        <div className="tab__status">Loading sales & listings data…</div>
      )}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load sales & listings data: {error}
        </div>
      )}

      {/* Five overview cards in a wide row on desktop */}
      <section className="tab__metrics tab__metrics--wide">
        {!loading && !snapshots.length && !error && (
          <div className="tab__status">
            No sales & listings data available yet.
          </div>
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
          title="New listings"
          series={newListingsSeries}
          valueKey="value"
          valueFormatter={formatCompactCount}
        />
        <ChartPanel
          title="Active listings"
          series={activeListingsSeries}
          valueKey="value"
          valueFormatter={formatCompactCount}
        />
        <ChartPanel
          title="SNLR"
          series={snlrSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
        <ChartPanel
          title="MOI (months of inventory)"
          series={moiSeries}
          valueKey="value"
          valueAxisLabel="Months"
        />
        <ChartPanel
          title="Absorption rate"
          series={absorptionRateSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
