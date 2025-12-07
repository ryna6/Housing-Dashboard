import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const RATE_METRICS = [
  "policy_rate",
  "mortgage_5y",
  "repo_volume",
  "gov_2y_yield",
  "gov_10y_yield",
];

const REGION: RegionCode = "canada";

/**
 * Trim a series down to the last N years based on the latest observation date.
 */
function trimLastYears(series: PanelPoint[], years: number): PanelPoint[] {
  if (series.length <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return sorted.filter((p) => {
    const d = new Date(p.date);
    return d >= cutoff;
  });
}

function formatCurrencyBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  return `$${value.toFixed(0)}`;
}

export const RatesBondsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rates_bonds");

  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, RATE_METRICS),
    [data]
  );

  const policySeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "policy_rate" && p.region === REGION),
        10
      ),
    [data]
  );

  const mortgageSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "mortgage_5y" && p.region === REGION),
        10
      ),
    [data]
  );

  const repoSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "repo_volume" && p.region === REGION),
        10
      ),
    [data]
  );

  const gov2Series: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "gov_2y_yield" && p.region === REGION),
        10
      ),
    [data]
  );

  const gov10Series: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "gov_10y_yield" && p.region === REGION),
        10
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rates</h1>
        <p className="tab__subtitle">
          Bank of Canada policy rate, 5-year mortgage rate, overnight repo volume, and Government of
          Canada bond yields (Bank of Canada)
        </p>
      </header>

      {loading && <div className="tab__status">Loading rates…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rates: {error}
        </div>
      )}

      <section className="tab__metrics tab__metrics--rates">
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
          treatAsPercentScale
          clampYMinToZero
          step
        />
        <ChartPanel
          title="5-year mortgage rate"
          series={mortgageSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
          step
        />
        <ChartPanel
          title="Overnight repo volume"
          series={repoSeries}
          valueKey="value"
          valueFormatter={formatCurrencyBillions}
          clampYMinToZero
        />
        <ChartPanel
          title="2-year Government bond yield"
          series={gov2Series}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
        <ChartPanel
          title="10-year Government bond yield"
          series={gov10Series}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
