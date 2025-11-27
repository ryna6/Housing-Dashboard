import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { RegionToggle } from "../components/RegionToggle";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const INFLATION_METRICS = [
  "cpi_headline",
  "cpi_shelter",
  "cpi_rent",
  "wage_index",
  "unemployment_rate"
];

export const InflationLabourTab: React.FC = () => {
  const { data, loading, error } = useTabData("inflation_labour");
  const [region, setRegion] = useState<RegionCode>("canada");

  const handleRegionChange = (next: RegionCode) => {
    setRegion(next);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, region, INFLATION_METRICS),
    [data, region]
  );

  const cpiSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          (p.metric === "cpi_headline" || p.metric === "cpi_shelter") &&
          p.region === region
      ),
    [data, region]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Inflation</h1>
        <p className="tab__subtitle">
          CPI, shelter & labour proxies (StatCan)
        </p>
      </header>

      <div className="tab__controls">
        <RegionToggle value={region} onChange={handleRegionChange} />
      </div>

      {loading && <div className="tab__status">Loading inflation data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load inflation metrics: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">No inflation data yet.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="Headline CPI – MoM %"
          series={cpiSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Headline CPI – YoY %"
          series={cpiSeries}
          valueKey="yoy_pct"
        />
      </section>
    </div>
  );
};
