import React from "react";
import type { PanelPoint } from "../data/types";

/**
 * Snapshot used for headline metric cards:
 * - metric: identifier string (e.g. "policy_rate")
 * - latest: most recent PanelPoint for that metric / region / segment
 * - prev: previous observation (for MoM deltas), if available
 */
export interface MetricSnapshot {
  metric: string;
  latest: PanelPoint;
  prev: PanelPoint | null;
}

interface Props {
  snapshot: MetricSnapshot;
}

const METRIC_LABELS: Record<string, string> = {
  policy_rate: "Policy rate",
  mortgage_5y: "5-year mortgage rate",
  gov_2y_yield: "2Y GoC yield",
  gov_5y_yield: "5Y GoC yield",
  gov_10y_yield: "10Y GoC yield",
  mortgage_5y_spread: "5Y mortgage spread",

  hpi_benchmark: "Benchmark HPI",
  avg_price: "Average price",
  teranet_hpi: "Teranet HPI",

  sales: "Sales",
  new_listings: "New listings",
  active_listings: "Active listings",
  snlr: "SNLR",
  moi: "Months of inventory",

  avg_rent: "Average rent",
  vacancy_rate: "Vacancy rate",
  rent_index: "Rent index",
  rent_inflation: "Rent inflation",

  cpi_headline: "Headline CPI",
  cpi_shelter: "Shelter CPI",
  cpi_rent: "Rent CPI",
  wage_index: "Wage index",
  unemployment_rate: "Unemployment rate",
};

function formatMetricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric.replace(/_/g, " ");
}

function formatValue(latest: PanelPoint): string {
  const value = latest.value;

  switch (latest.unit) {
    case "pct":
      // Show at least 2 decimal places for rates / % (e.g. 2.25%, 3.51%)
      return `${value.toFixed(2)}%`;
    case "cad":
      return `$${value.toLocaleString("en-CA", {
        maximumFractionDigits: 0,
      })}`;
    case "index":
      return value.toFixed(1);
    case "count":
      return value.toLocaleString("en-CA");
    case "ratio":
      return value.toFixed(2);
    default:
      return value.toFixed(2);
  }
}

function signClass(base: string, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return base;
  if (value > 0) return `${base} ${base}--up`;
  if (value < 0) return `${base} ${base}--down`;
  return base;
}

export const MetricSnapshotCard: React.FC<Props> = ({ snapshot }) => {
  const { metric, latest, prev } = snapshot;

  const deltaAbs = prev ? latest.value - prev.value : null;
  const deltaPct =
    latest.mom_pct != null
      ? latest.mom_pct
      : prev && prev.value !== 0
      ? ((latest.value / prev.value) - 1) * 100
      : null;

  const hasDelta = deltaAbs != null || deltaPct != null;
  const yoy = latest.yoy_pct ?? null;

  const deltaClass = signClass("metric-card__delta", deltaPct ?? deltaAbs ?? null);
  const yoyClass = signClass("metric-card__secondary", yoy);

  return (
    <div className="metric-card">
      <div className="metric-card__header">
        <div className="metric-card__title">{formatMetricLabel(metric)}</div>
        <div className="metric-card__value">{formatValue(latest)}</div>
      </div>

      {hasDelta && (
        <div className={deltaClass}>
          {deltaAbs != null && (
            <>
              Δ {deltaAbs > 0 ? "+" : ""}
              {deltaAbs.toFixed(latest.unit === "pct" ? 2 : 1)}
            </>
          )}
          {deltaPct != null && (
            <>
              {" "}
              (
              {deltaPct > 0 ? "+" : ""}
              {deltaPct.toFixed(1)}%
              <span className="metric-card__delta-label"> MoM</span>
              )
            </>
          )}
        </div>
      )}

      {yoy != null && (
        <div className={yoyClass}>
          YoY: {yoy > 0 ? "+" : ""}
          {yoy.toFixed(1)}%
        </div>
      )}
    </div>
  );
};
