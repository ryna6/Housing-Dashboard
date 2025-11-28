import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode, Segment } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const SALES_METRICS = ["sales", "new_listings", "active_listings", "snlr", "moi"];

export const SalesListingsTab: React.FC = () => {
  const { data, loading, error } = useTabData("sales_listings");

  const handleRegionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRegion(event.target.value as RegionCode);
  };

  const handleSegmentChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSegment(event.target.value as Segment);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, region, SALES_METRICS, segment),
    [data, region, segment]
  );

  const salesSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "sales" &&
          p.region === region &&
          (segment === "all" || p.segment === segment)
      ),
    [data, region, segment]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Sales</h1>
        <p className="tab__subtitle">
          Active & new listings, Sales to New Listings Ratio (SNLR), Months of Inventory (MOI), and absorption rate (Canadian Real Estate Association)
        </p>
      </header>

      {loading && <div className="tab__status">Loading sales data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load sales data: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">
            No sales data for this selection yet.
          </div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="Sales – MoM %"
          series={salesSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Sales – YoY %"
          series={salesSeries}
          valueKey="yoy_pct"
        />
      </section>
    </div>
  );
};
