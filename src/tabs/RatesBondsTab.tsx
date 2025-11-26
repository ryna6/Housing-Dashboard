import React, { useEffect, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { RegionToggle } from "../components/RegionToggle";
import { MetricSnapshotCard, Snapshot } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

const METRICS = [
  "boc_overnight",
  "prime_proxy",
  "goc_2y_yield",
  "goc_5y_yield",
  "goc_10y_yield",
  "yield_curve_10y_2y",
  "real_policy_rate"
];
const PRIMARY_METRIC = "boc_overnight";

export const RatesBondsTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [region, setRegion] = useState<RegionCode>("canada");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabData("rates_bonds")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  const snapshots = getLatestByMetric(
    data,
    "canada",
    METRICS,
    "all"
  ) as Snapshot[];

  const primarySeries = data.filter(
    (p) => p.region === "canada" && p.metric === PRIMARY_METRIC
  );
  const momSeries = primarySeries.filter((p) => p.mom_pct != null);
  const yoySeries = primarySeries.filter((p) => p.yoy_pct != null);

  return (
    <div className="tab">
      <div className="tab__header">
        <RegionToggle
          value={region}
          onChange={setRegion}
          allowedRegions={["canada"]}
          note="Interest rates are national; province toggle not applicable."
        />
      </div>

      <div className="card-grid">
        {snapshots.length === 0 && (
          <div className="tab__note">No rates/bonds data yet.</div>
        )}
        {snapshots.map((snap) => (
          <MetricSnapshotCard key={snap.metric} snapshot={snap} />
        ))}
      </div>

      <div className="chart-grid">
        <ChartPanel
          title="BoC Overnight MoM %"
          series={momSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="BoC Overnight YoY %"
          series={yoySeries}
          valueKey="yoy_pct"
        />
      </div>
    </div>
  );
};

