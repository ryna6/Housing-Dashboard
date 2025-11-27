import React, { useMemo, useState } from "react";
import type {
  PanelPoint,
  RegionCode,
  Segment,
  MarketCode
} from "../data/types";
import { RegionToggle } from "../components/RegionToggle";
import { MarketSelector } from "../components/MarketSelector";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";
import { REGIONS_BY_MARKET } from "../data/regions";

const SALES_METRICS = ["sales", "new_listings", "active_listings", "snlr", "moi"];

export const SalesListingsTab: React.FC = () => {
  const { data, loading, error } = useTabData("sales_listings");
  const [market, setMarket] = useState<MarketCode>("canada");
  const [region, setRegion] = useState<RegionCode | null>(null);
  const [segment, setSegment] = useState<Segment>("all");

  const effectiveRegion: RegionCode = region ?? market;
  const hasRegions = REGIONS_BY_MARKET[market].length > 0;

  const handleMarketChange = (next: MarketCode) => {
    setMarket(next);
    setRegion(null);
  };

  const handleSegmentChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setSegment(event.target.value as Segment);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, effectiveRegion, SALES_METRICS, segment),
    [data, effectiveRegion, segment]
  );

  const salesSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "sales" &&
          p.region === effectiveRegion &&
          (segment === "all" || p.segment === segment)
      ),
    [data, effectiveRegion, segment]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Sales</h1>
        <p className="tab__subtitle">
          Resale volumes, listings, absorption (monthly)
        </p>
      </header>

      <div className="tab__controls">
        <MarketSelector value={market} onChange={handleMarketChange} />

        {hasRegions && (
          <div className="tab__regions-group">
            <span className="tab__regions-label">Regions:</span>
            <RegionToggle
              market={market}
              value={region}
              onChange={setRegion}
            />
          </div>
        )}

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
          Failed to load sales: {error}
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
