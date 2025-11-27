import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { RegionToggle } from "../components/RegionToggle";
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

export const RatesBondsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rates_bonds");
  const [region, setRegion] = useState<RegionCode>("canada");

  const handleRegionChange = (next: RegionCode) => {
    setRegion(next);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, region, RATE_METRICS),
    [data, region]
  );

  const policySeries: PanelPoint[] = useMemo(
    () =>
      data.filter((p) => p.metric === "policy_rate" && p.region === region),
    [data, region]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rates</h1>
        <p className="tab__subtitle">
          Policy rate, mortgage rates & bond yields (BoC)
        </p>
      </header>

      <div className="tab__controls">
        <RegionToggle
          value={region}
          onChange={handleRegionChange}
          allowedRegions={["canada"]}
        />
      </div>

      {loading && <div className="tab__status">Loading rates…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rates: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">No rate data yet.</div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="BoC policy rate – MoM % change"
          series={policySeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="BoC policy rate – YoY % change"
          series={policySeries}
          valueKey="yoy_pct"
        />
      </section>
    </div>
  );
};
