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
          CPI, shelter & labour proxies (StatCan)
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
          title="Headline CPI – index level"
          series={headlineSeries}
          valueKey="value"
          valueAxisLabel="Index (2002=100)"
        />
        <ChartPanel
          title="Shelter CPI – index level"
          series={shelterSeries}
          valueKey="value"
          valueAxisLabel="Index (2002=100)"
        />
        <ChartPanel
          title="Rent CPI – index level"
          series={rentSeries}
          valueKey="value"
          valueAxisLabel="Index (2002=100)"
        />
        <ChartPanel
          title="Wage index – level"
          series={wageSeries}
          valueKey="value"
          valueAxisLabel="$/week"
        />
        <ChartPanel
          title="Unemployment rate – level %"
          series={unemploymentSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
