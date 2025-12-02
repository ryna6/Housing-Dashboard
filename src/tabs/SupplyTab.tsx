import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const REGION: RegionCode = "canada";

type HousingType = "total_residential" | "single" | "row" | "apartment";

const HOUSING_TYPE_OPTIONS: { value: HousingType; label: string }[] = [
  { value: "total_residential", label: "Total residential" },
  { value: "single", label: "Single detached" },
  { value: "row", label: "Row" },
  { value: "apartment", label: "Apartment" },
];

const HOUSING_TYPE_METRICS: string[] = [
  "housing_starts",
  "under_construction",
  "completions",
  "investment_construction",
];

const CARD_TITLES: Record<string, string> = {
  housing_starts: "Housing starts",
  under_construction: "Under construction",
  completions: "Completions",
  investment_construction: "Residential construction investment",
};

function getHousingTypeLabel(ht: HousingType): string {
  const opt = HOUSING_TYPE_OPTIONS.find((o) => o.value === ht);
  return opt ? opt.label : ht;
}

/**
 * Trim a time series down to the last N calendar years,
 * preserving ordering and all recent data.
 */
function trimLastYears(series: PanelPoint[], years: number): PanelPoint[] {
  if (series.length <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return sorted.filter((p) => {
    const d = new Date(p.date);
    return d >= cutoff;
  });
}

/**
 * Compact formatter for counts, e.g. 100K, 1.2M.
 */
function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

/**
 * Compact formatter for CAD flows in billions,
 * e.g. $18.2B, falling back to M/K for smaller values.
 */
function formatCurrencyBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatHousingTooltip(value: number): string {
  if (!Number.isFinite(value)) return "–";

  const abs = Math.abs(value);
  let scaled = value;
  let suffix = "";

  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${scaled.toFixed(1)}${suffix}`;
}

function formatMoneyTooltip(value: number): string {
  if (!Number.isFinite(value)) return "–";

  const abs = Math.abs(value);
  let scaled = value;
  let suffix = "";
  
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  return `$${scaled.toFixed(1)}${suffix}`;
}

export const SupplyTab: React.FC = () => {
  const { data, loading, error } = useTabData("supply");
  const [housingType, setHousingType] = useState<HousingType>(
    "total_residential"
  );

  // Latest readings for the four housing-type metrics (starts / UC / completions / investment)
  const housingSnapshots = useMemo(
    () =>
      getLatestByMetric(
        data,
        REGION,
        HOUSING_TYPE_METRICS,
        housingType
      ),
    [data, housingType]
  );

  // One time series per metric, filtered to Canada + selected housing type,
  // trimmed to the most recent 10 years.
  const housingStartsSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) =>
            p.metric === "housing_starts" &&
            p.region === REGION &&
            p.segment === housingType
        ),
        10
      ),
    [data, housingType]
  );

  const underConstructionSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) =>
            p.metric === "under_construction" &&
            p.region === REGION &&
            p.segment === housingType
        ),
        10
      ),
    [data, housingType]
  );

  const completionsSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) =>
            p.metric === "completions" &&
            p.region === REGION &&
            p.segment === housingType
        ),
        10
      ),
    [data, housingType]
  );

  const investmentSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        data.filter(
          (p) =>
            p.metric === "investment_construction" &&
            p.region === REGION &&
            p.segment === housingType
        ),
        10
      ),
    [data, housingType]
  );

  const housingTypeLabel = getHousingTypeLabel(housingType);

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Supply</h1>
        <p className="tab__subtitle">
          Housing starts, units under construction, completions, and residential
          construction investment (Statistics Canada)
        </p>
      </header>

      {/* Controls row: housing type selector */}
      <div className="tab__controls">
        <div className="tab__segment">
          <span>Housing type:</span>
          <select
            value={housingType}
            onChange={(e) => setHousingType(e.target.value as HousingType)}
          >
            {HOUSING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="tab__metrics">
        {!loading && !error && !housingSnapshots.length && (
          <div className="tab__status">No supply data yet.</div>
        )}

        {housingSnapshots.map((snapshot) => (
          <MetricSnapshotCard
            key={`${snapshot.metric}-${housingType}`}
            snapshot={snapshot}
            titleOverride={CARD_TITLES[snapshot.metric] ?? snapshot.metric}
          />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title={`${housingTypeLabel} housing starts`}
          series={housingStartsSeries}
          valueKey="value"
          valueFormatter={formatCompactNumber}
          tooltipValueFormatter={formatHousingTooltip}
          clampYMinToZero
        />
        <ChartPanel
          title={`${housingTypeLabel} construction`}
          series={underConstructionSeries}
          valueKey="value"
          valueFormatter={formatCompactNumber}
          tooltipValueFormatter={formatHousingTooltip}
          clampYMinToZero
        />
        <ChartPanel
          title={`${housingTypeLabel} completions`}
          series={completionsSeries}
          valueKey="value"
          valueFormatter={formatCompactNumber}
          tooltipValueFormatter={formatHousingTooltip}
          clampYMinToZero
        />
        <ChartPanel
          title={`${housingTypeLabel} investment`}
          series={investmentSeries}
          valueKey="value"
          valueFormatter={formatCurrencyBillions}
          tooltipValueFormatter={formatMoneyTooltip}
          clampYMinToZero
        />
      </section>
    </div>
  );
};
