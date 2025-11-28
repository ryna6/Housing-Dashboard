import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

// Regions available on the Prices tab only
// (UI labels are exactly what the user should see.)
const REGION_OPTIONS: { value: RegionCode; label: string }[] = [
  { value: "canada", label: "Canada (aggregate)" },
  { value: "vancouver", label: "Vancouver" },
  { value: "lower_mainland" as RegionCode, label: "Lower Mainland" },
  {
    value: "greater_toronto" as RegionCode,
    label: "Greater Toronto Area",
  },
  { value: "calgary" as RegionCode, label: "Calgary" },
  { value: "montreal" as RegionCode, label: "Montreal" },
];

// Housing types (segments) available on this tab
export type HousingType =
  | "composite"
  | "one_storey"
  | "two_storey"
  | "townhouse"
  | "apartment";

const HOUSING_TYPE_OPTIONS: { value: HousingType; label: string }[] = [
  { value: "composite", label: "Composite" },
  { value: "one_storey", label: "One storey" },
  { value: "two_storey", label: "Two storey" },
  { value: "townhouse", label: "Townhouse" },
  { value: "apartment", label: "Apartment" },
];

export const PricesTab: React.FC = () => {
  const { data, loading, error } = useTabData("prices");

  // Default selection: Canada (aggregate), Composite
  const [region, setRegion] = useState<RegionCode>("canada");
  const [housingType, setHousingType] = useState<HousingType>("composite");

  const handleRegionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRegion(event.target.value as RegionCode);
  };

  const handleHousingTypeChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setHousingType(event.target.value as HousingType);
  };

  // Three snapshot cards: Benchmark HPI, Housing type HPI, Average price
  const snapshots: MetricSnapshot[] = useMemo(() => {
    if (!data.length) return [];

    const all: MetricSnapshot[] = [];

    // 1) Benchmark HPI (composite, region-only)
    const benchmark = getLatestByMetric(
      data,
      region,
      ["hpi_benchmark"],
      "composite"
    );

    // 2) Housing type HPI (region + housing type)
    const hpiType = getLatestByMetric(data, region, ["hpi_type"], housingType);

    // 3) Average price (region + housing type)
    const avgPrice = getLatestByMetric(
      data,
      region,
      ["avg_price"],
      housingType
    );

    if (benchmark.length) all.push(benchmark[0]);
    if (hpiType.length) all.push(hpiType[0]);
    if (avgPrice.length) all.push(avgPrice[0]);

    return all;
  }, [data, region, housingType]);

  // Chart series – values only (no MoM/YoY charts)
  const benchmarkSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "hpi_benchmark" &&
          p.region === region &&
          p.segment === "composite"
      ),
    [data, region]
  );

  const hpiTypeSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "hpi_type" &&
          p.region === region &&
          p.segment === housingType
      ),
    [data, region, housingType]
  );

  const avgPriceSeries: PanelPoint[] = useMemo(
    () =>
      data.filter(
        (p) =>
          p.metric === "avg_price" &&
          p.region === region &&
          p.segment === housingType
      ),
    [data, region, housingType]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Prices</h1>
        <p className="tab__subtitle">
          MLS HPI benchmark and average prices (monthly)
        </p>
      </header>

      <div className="tab__controls">
        {/* Regions selector */}
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

        {/* Housing type selector */}
        <div className="tab__segment">
          Housing type
          <select value={housingType} onChange={handleHousingTypeChange}>
            {HOUSING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="tab__status">Loading price data…</div>}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load prices: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !snapshots.length && (
          <div className="tab__status">
            No price data for this selection yet.
          </div>
        )}
        {snapshots.map((s) => (
          <MetricSnapshotCard key={s.metric} snapshot={s} />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title="Benchmark HPI"
          series={benchmarkSeries}
          valueKey="value"
          valueAxisLabel="HPI (index)"
        />
        <ChartPanel
          title="Housing type HPI"
          series={hpiTypeSeries}
          valueKey="value"
          valueAxisLabel="HPI (index)"
        />
        <ChartPanel
          title="Average price"
          series={avgPriceSeries}
          valueKey="value"
          valueAxisLabel="Benchmark price ($)"
        />
      </section>
    </div>
  );
};
