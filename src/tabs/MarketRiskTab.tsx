import React, { useEffect, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { RegionToggle } from "../components/RegionToggle";
import { MetricSnapshotCard, Snapshot } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

const METRICS = ["tsx_index_level", "tsx_30d_vol"];
const PRIMARY_METRIC = "tsx_index_level";

export const MarketRiskTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [region, setRegion] = useState<RegionCode>("canada"); // TSX is national, but keep toggle for consistency
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabData("market_risk")
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
          note="TSX is a national index; province toggle not applicable."
        />
      </div>

      <div className="card-grid">
        {snapshots.length === 0 && (
          <div className="tab__note">No market data yet.</div>
        )}
        {snapshots.map((snap) => (
          <MetricSnapshotCard key={snap.metric} snapshot={snap} />
        ))}
      </div>

      <div className="chart-grid">
        <ChartPanel
          title="TSX index MoM %"
          series={momSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="TSX index YoY %"
          series={yoySeries}
          valueKey="yoy_pct"
        />
      </div>
    </div>
  );
};

