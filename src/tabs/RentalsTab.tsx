import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { RegionToggle } from "../components/RegionToggle";
import { MarketSelector } from "../components/MarketSelector";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const RENT_METRICS = ["avg_rent", "vacancy_rate", "rent_index", "rent_inflation"];

export const RentalsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rentals");
  const [region, setRegion] = useState<RegionCode>("canada");
  const [market, setMarket] = useState<RegionCode | null>(null);

  const effectiveRegion: RegionCode = market ?? region;

  const handleRegionChange = (next: RegionCode) => {
    setRegion(next);
    if (next === "gta" || next === "metro_vancouver") {
      setMarket(next);
    } else {
      setMarket(null);
    }
  };

  const handleMarketChange = (next: RegionCode | null) => {
    setMarket(next);
    if (next) setRegion(next);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, effectiveRegion, RENT_METRICS),
    [data, effectiveRegion]
  );

  const rentSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          (p.metric === "avg_rent" || p.metric === "rent_index") &&
          p.region === effectiveRegion
      ),
    [data, effectiveRegion]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rentals</h1>
        <p className="tab__subtitle">
          Rents & vacancy (CMHC, TRREB / GVR where available)
        </p>
      </header>

      <div className="tab__controls">
        <RegionToggle value={region} onChange={handleRegionChange} />
        <MarketSelector value={market} onChange={handleMarketChange} />
      </div>

      {loading && <div className="tab__status">Loading rental data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rentals: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">
            No rental data for this selection yet.
          </div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="Rents – MoM %"
          series={rentSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Rents – YoY %"
          series={rentSeries}
          valueKey="yoy_pct"
        />
      </section>
    </div>
  );
};
