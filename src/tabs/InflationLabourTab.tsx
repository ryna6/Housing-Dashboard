import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const INFLATION_METRICS: string[] = [
  "cpi_headline",
  "cpi_shelter",
  "cpi_rent",
  "wage_index",
  "unemployment_rate",
];

const REGION: RegionCode = "canada";

/**
 * Trim a series down to the last N years based on the latest observation date.
 * Mirrors the helper in RatesBondsTab so charts auto-focus on the recent decade.
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

export const InflationLabourTab: React.FC = () => {
  const { data, loading, error } = useTabData("inflation_labour");

  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, INFLATION_METRICS),
    [data]
  );

  // Per-metric series, trimmed to the last 10 years
  const headlineSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) => p.metric === "cpi_headline" && p.region === REGION
        ),
        10
      ),
    [data]
  );

  const shelterSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) => p.metric === "cpi_shelter" && p.region === REGION
        ),
        10
      ),
    [data]
  );

  const rentSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "cpi_rent" && p.region === REGION),
        10
      ),
    [data]
  );

  const wageSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter((p) => p.metric === "wage_index" && p.region === REGION),
        10
      ),
    [data]
  );

  const unemploymentSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) => p.metric === "unemployment_rate" && p.region === REGION
        ),
        10
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Inflation</h1>
        <p className="tab__subtitle">
          CPI, owned & rented housing CPI, and unemployment rate (Statistics Canada)
        </p>
      </header>

      {loading && (
        <div className="tab__status">Loading inflation data…</div>
      )}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load inflation metrics: {error}
        </div>
      )}

      {/* Wide layout so all 5 overview cards sit side-by-side on desktop */}
      <section className="tab__metrics tab__metrics--wide">
        {!loading && !snapshots.length && !error && (
          <div className="tab__status">No inflation data yet.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      {/* One chart for each overview metric, all using actual levels */}
      <section className="tab__charts">
        <ChartPanel
          title="Headline CPI"
          series={headlineSeries}
          valueKey="value"
        />
        <ChartPanel
          title="Owned accommodation CPI"
          series={shelterSeries}
          valueKey="value"
        />
        <ChartPanel
          title="Rent CPI"
          series={rentSeries}
          valueKey="value"
        />
        <ChartPanel
          title="Wage index"
          series={wageSeries}
          valueKey="value"
        />
        <ChartPanel
          title="Unemployment rate"
          series={unemploymentSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
