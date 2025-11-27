import React, { useEffect, useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

const REGION: RegionCode = "canada";

const RATE_METRICS: string[] = [
  "policy_rate",
  "mortgage_5y",
  "gov_2y_yield",
  "gov_5y_yield",
  "gov_10y_yield",
  "mortgage_5y_spread",
];

export const RatesBondsTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTabData("rates_bonds")
      .then((points) => {
        if (!cancelled) {
          setData(points);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshots = useMemo(
    () => getLatestByMetric(data, REGION, RATE_METRICS),
    [data]
  );

  const policySeries = useMemo(
    () =>
      data.filter(
        (p) => p.metric === "policy_rate" && p.region === REGION
      ),
    [data]
  );

  const mortgageSeries = useMemo(
    () =>
      data.filter(
        (p) => p.metric === "mortgage_5y" && p.region === REGION
      ),
    [data]
  );

  // Convert percentage points (e.g. 2.25) to basis points (225) for charting.
  const toBasisPoints = (series: PanelPoint[]): PanelPoint[] =>
    series.map((p) => ({
      ...p,
      value: p.value * 100,
    }));

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rates</h1>
        <p className="tab__subtitle">
          Bank of Canada policy rate, Government of Canada bond yields and
          conventional 5-year mortgage rates.
        </p>
      </header>

      {loading && <div className="tab__status">Loading rates…</div>}
      {error && !loading && (
        <div className="tab__status tab__status--error">
          Failed to load rates: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && !error && (
          <div className="tab__status">No rate data available.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="BoC policy rate (basis points)"
          series={toBasisPoints(policySeries)}
          valueKey="value"
          valueAxisLabel="bps"
        />
        <ChartPanel
          title="Conventional 5-year mortgage rate (basis points)"
          series={toBasisPoints(mortgageSeries)}
          valueKey="value"
          valueAxisLabel="bps"
        />
      </section>
    </div>
  );
};
