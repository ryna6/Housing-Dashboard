import React, { useEffect, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { loadTabData, getLatestByMetric } from "../data/dataClient";
import { RegionToggle } from "../components/RegionToggle";
import { MarketSelector } from "../components/MarketSelector";
import { MetricSnapshotCard, Snapshot } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";

export const PricesTab: React.FC = () => {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [region, setRegion] = useState<RegionCode>("canada");
  const [market, setMarket] = useState<RegionCode | null>(null);
  const [segment] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTabData("prices")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  const baseMetrics = ["hpi_benchmark", "avg_price_gvr", "avg_price_trreb"];

  const latestSnapshots = getLatestByMetric(
    data,
    market ?? region,
    baseMetrics,
    segment
  ) as Snapshot[];

  const regionFilter = (p: PanelPoint) =>
    p.segment === segment &&
    ((market === null && p.region === region) ||
      (market !== null && p.region === market));

  const hpiSeries = data.filter(
    (p) => regionFilter(p) && p.metric === "hpi_benchmark"
  );

  const hpiMomSeries = hpiSeries.filter((p) => p.mom_pct != null);
  const hpiYoySeries = hpiSeries.filter((p) => p.yoy_pct != null);

  return (
    <div className="tab">
      <div className="tab__header">
        <RegionToggle
          value={region}
          onChange={setRegion}
          allowedRegions={["canada", "on", "bc"]}
        />
        <MarketSelector value={market} onChange={setMarket} />
      </div>

      <div className="card-grid">
        {latestSnapshots.length === 0 && (
          <div className="tab__note">No price data yet.</div>
        )}
        {latestSnapshots.map((snap) => (
          <MetricSnapshotCard key={snap.metric} snapshot={snap} />
        ))}
      </div>

      <div className="chart-grid">
        <ChartPanel title="HPI MoM %" series={hpiMomSeries} valueKey="mom_pct" />
        <ChartPanel title="HPI YoY %" series={hpiYoySeries} valueKey="yoy_pct" />
      </div>
    </div>
  );
};
