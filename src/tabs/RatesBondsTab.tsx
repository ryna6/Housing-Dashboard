import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const RATE_METRICS = [
  "policy_rate",
  "repo_rate",
  "mortgage_5y",
  "gov_2y_yield",
  "gov_10y_yield",
  "mortgage_5y_spread",
] as const;

const REGION: RegionCode = "canada";

type RateMetricKey = (typeof RATE_METRICS)[number];

function trimLastYears(points: PanelPoint[], years: number): PanelPoint[] {
  if (!points.length) return points;

  const lastDate = new Date(points[points.length - 1].date);
  const cutoff = new Date(lastDate);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return points.filter((p) => new Date(p.date) >= cutoff);
}

export const RatesBondsTab: React.FC = () => {
  const { data, isLoading, error } = useTabData("rates_bonds");

  const latestByMetric = useMemo(
    () => getLatestByMetric(data, REGION, RATE_METRICS),
    [data]
  );

  const policySeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) =>
            p.region === REGION && p.metric === "policy_rate"
        ),
        10
      ),
    [data]
  );

  const repoSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) => p.region === REGION && p.metric === "repo_rate"
        ),
        10
      ),
    [data]
  );

  const mortgageSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) => p.region === REGION && p.metric === "mortgage_5y"
        ),
        10
      ),
    [data]
  );

  const gov2Series: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) => p.region === REGION && p.metric === "gov_2y_yield"
        ),
        10
      ),
    [data]
  );

  const gov10Series: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) => p.region === REGION && p.metric === "gov_10y_yield"
        ),
        10
      ),
    [data]
  );

  const spreadSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p: PanelPoint) =>
            p.region === REGION && p.metric === "mortgage_5y_spread"
        ),
        10
      ),
    [data]
  );

  if (error) {
    return (
      <div className="tab tab--rates">
        <p className="tab__error">Error loading data: {String(error)}</p>
      </div>
    );
  }

  return (
    <div className="tab tab--rates">
      <header className="tab__header">
        <h1 className="tab__title">Interest rates &amp; bond yields</h1>
        <p className="tab__subtitle">
          Bank of Canada policy rate, overnight repo rate (CORRA / OMMFR),
          5-year mortgage rate and Government of Canada bond yields. Monthly
          data, latest 10 years.
        </p>
      </header>

      <section className="tab__cards">
        {RATE_METRICS.map((metric: RateMetricKey) => {
          const latest = latestByMetric[metric];

          if (!latest) return null;

          return (
            <MetricSnapshotCard
              key={metric}
              // If your MetricSnapshotCard uses different prop names,
              // just adjust these three props.
              metricId={metric as string}
              latest={latest}
              isLoading={isLoading}
            />
          );
        })}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="BoC policy rate (target overnight rate)"
          series={policySeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
          step
        />
        <ChartPanel
          title="Overnight repo rate (CORRA / OMMFR proxy)"
          series={repoSeries}
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
        <ChartPanel
          title="5-year mortgage spread over 5-year GoC yield"
          series={spreadSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
