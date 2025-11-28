import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode, Segment } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const SALES_METRICS = ["sales", "new_listings", "active_listings", "snlr", "moi"];

const REGION_OPTIONS: { value: RegionCode; label: string }[] = [
  { value: "canada", label: "Canada" },
  { value: "greater_vancouver", label: "Vancouver" },
  { value: "lower_mainland", label: "Lower Mainland (Burnaby, Surrey, New West, Coquitlam)", },
  { value: "calgary", label: "Calgary" },
  { value: "greater_toronto", label: "Greater Toronto Area (GTA)" },
  { value: "montreal", label: "Montreal" },
];

export const SalesListingsTab: React.FC = () => {
  const { data, loading, error } = useTabData("sales_listings");

  // New unified region selector (no MarketCode)
  const [region, setRegion] = useState<RegionCode>("canada");
  // Same segment logic as before: all | condo | freehold
  const [segment, setSegment] = useState<Segment>("all");

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

      {/* New unified controls: Regions + Segment */}
      <div className="tab__controls">
        <div className="tab__regions-group">
          <span className="tab__regions-label">Regions:</span>
          <select
            className="tab__regions-select"
            value={region}
            onChange={handleRegionChange}
          >
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tab__segment">
          Segment
          <select value={segment} onChange={handleSegmentChange}>
            <option value="all">All</option>
            <option value="condo">Condo</option>
            <option value="freehold">Freehold</option>
          </select>
        </div>
      </div>

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
