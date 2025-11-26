import React, { useEffect, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { RegionToggle } from "../components/RegionToggle";
import { MetricSnapshotCard, Snapshot } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

const METRICS = ["mortgage_arrears_rate", "consumer_insolvencies_per_100k"];
const PRIMARY_METRIC = "mortgage_arrears_rate";

export const CreditStressTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [region, setRegion] = useState<RegionCode>("canada");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabData("credit_stress")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  const snapshots = getLatestByMetric(
    data,
    region,
    METRICS,
    "all"
  ) as Snapshot[];

  const primarySeries = data.filter(
    (p) => p.region === region && p.metric === PRIMARY_METRIC
  );
  const momSeries = primarySeries.filter((p) => p.mom_pct != null);
  const yoySeries = primarySeries.filter((p) => p.yoy_pct != null);

  return (
    <div className="tab">
      <div className="tab__header">
        <RegionToggle
          value={region}
          onChange={setRegion}
          allowedRegions={["canada", "on", "bc"]}
        />
      </div>

      <div className="card-grid">
        {snapshots.length === 0 && (
          <div className="tab__note">No credit stress data yet.</div>
        )}
        {snapshots.map((snap) => (
          <MetricSnapshotCard key={snap.metric} snapshot={snap} />
        ))}
      </div>

      <div className="chart-grid">
        <ChartPanel
          title="Mortgage arrears MoM %"
          series={momSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Mortgage arrears YoY %"
          series={yoySeries}
          valueKey="yoy_pct"
        />
      </div>
    </div>
  );
};

