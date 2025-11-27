import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
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

const REGION: RegionCode = "canada";

export const InflationLabourTab: React.FC = () => {
  const { data, loading, error } = useTabData("inflation_labour");

  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, INFLATION_METRICS),
    [data]
  );

  const cpiSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          (p.metric === "cpi_headline" || p.metric === "cpi_shelter") &&
          p.region === REGION
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Inflation</h1>
        <p className="tab__subtitle">
          CPI, shelter & labour proxies (StatCan)
        </p>
      </header>

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
