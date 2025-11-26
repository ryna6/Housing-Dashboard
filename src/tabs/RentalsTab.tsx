import React, { useEffect, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { RegionToggle } from "../components/RegionToggle";
import { MetricSnapshotCard, Snapshot } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

const METRICS = ["rental_vacancy_rate", "rent_growth_yoy"];
const PRIMARY_METRIC = "rental_vacancy_rate";

export const RentalsTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [region, setRegion] = useState<RegionCode>("canada");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabData("rentals")
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
          <div className="tab__note">No rental data yet.</div>
        )}
        {snapshots.map((snap) => (
          <MetricSnapshotCard key={snap.metric} snapshot={snap} />
        ))}
      </div>

      <div className="chart-grid">
        <ChartPanel
          title="Vacancy rate MoM %"
          series={momSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Vacancy rate YoY %"
          series={yoySeries}
          valueKey="yoy_pct"
        />
      </div>
    </div>
  );
};

