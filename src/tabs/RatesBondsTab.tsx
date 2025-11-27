import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const RATE_METRICS = [
  "policy_rate",
  "mortgage_5y",
  "gov_2y_yield",
  "gov_5y_yield",
  "gov_10y_yield",
  "mortgage_5y_spread"
];

const REGION: RegionCode = "canada";

export const RatesBondsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rates_bonds");

  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, RATE_METRICS),
    [data]
  );

  const policySeries: PanelPoint[] = useMemo(
    () =>
      data.filter((p) => p.metric === "policy_rate" && p.region === REGION),
    [data]
  );

  const mortgageSeries: PanelPoint[] = useMemo(
    () =>
      data.filter((p) => p.metric === "mortgage_5y" && p.region === REGION),
    [data]
  );

  const gov2Series: PanelPoint[] = useMemo(
    () =>
      data.filter((p) => p.metric === "gov_2y_yield" && p.region === REGION),
    [data]
  );

  const gov10Series: PanelPoint[] = useMemo(
    () =>
      data.filter((p) => p.metric === "gov_10y_yield" && p.region === REGION),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rates</h1>
        <p className="tab__subtitle">
          Bank of Canada policy rate, 5-year mortgage rate and Government of
          Canada bond yields.
        </p>
      </header>

      {loading && <div className="tab__status">Loading rates…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rates: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && !error && (
          <div className="tab__status">No rate data yet.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="BoC policy rate"
          series={policySeries}
          valueKey="value"
          valueAxisLabel="%"
          step
        />
        <ChartPanel
          title="Conventional 5-year mortgage rate"
          series={mortgageSeries}
          valueKey="value"
          valueAxisLabel="%"
          step
        />
        <ChartPanel
          title="2-year Government of Canada bond yield"
          series={gov2Series}
          valueKey="value"
          valueAxisLabel="%"
        />
        <ChartPanel
          title="10-year Government of Canada bond yield"
          series={gov10Series}
          valueKey="value"
          valueAxisLabel="%"
        />
      </section>
    </div>
  );
};
