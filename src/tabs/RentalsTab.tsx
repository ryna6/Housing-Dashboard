import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const RENT_METRICS = ["avg_rent", "vacancy_rate", "rent_index", "rent_inflation"];

const REGION_OPTIONS: { value: RegionCode; label: string }[] = [
  { value: "canada", label: "Canada" },
  { value: "greater_vancouver", label: "Vancouver" },
  { value: "lower_mainland", label: "Lower Mainland (Burnaby, Surrey, New West, Coquitlam)" },
  { value: "calgary", label: "Calgary" },
  { value: "greater_toronto", label: "Greater Toronto Area (GTA)" },
  { value: "montreal", label: "Montreal" },
];

export const RentalsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rentals");
  const [region, setRegion] = useState<RegionCode>("canada");

  const handleRegionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRegion(event.target.value as RegionCode);
  };

  const snapshots = useMemo(
    () => getLatestByMetric(data, region, RENT_METRICS),
    [data, region]
  );

  const rentSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          (p.metric === "avg_rent" || p.metric === "rent_index") &&
          p.region === region
      ),
    [data, region]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rentals</h1>
        <p className="tab__subtitle">
          Rents & vacancy (CMHC, TRREB / GVR where available)
        </p>
      </header>

      {/* New unified region selector */}
      <div className="tab__controls">
        <div className="tab__regions-group">
          <span className="tab__regions-label">Regions:</span>
          <select
            className="tab__regions-select"
            value={region}
            onChange={handleRegionChange}
          >
            {REGION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="tab__status">Loading rental data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rental data: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">
            No rental data for this selection yet.
          </div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="Rents – MoM %"
          series={rentSeries}
          valueKey="mom_pct"
        />
        <ChartPanel
          title="Rents – YoY %"
          series={rentSeries}
          valueKey="yoy_pct"
        />
      </section>
    </div>
  );
};
