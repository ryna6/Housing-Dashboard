import React from "react";
import type { PanelPoint } from "../data/types";

export interface MetricSnapshot {
  metric: string;
  latest: PanelPoint;
  prev: PanelPoint | null;
}

interface Props {
  snapshot: MetricSnapshot;
}

function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "–";

  if (unit === "pct") {
    // show two decimals for rates / percentages
    return `${value.toFixed(2)}%`;
  }

  if (unit === "cad") {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  }

  if (unit === "index") {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function labelForMetric(metric: string): string {
  switch (metric) {
    case "hpi_benchmark":
      return "Benchmark HPI";
    case "avg_price":
      return "Average price";
    case "teranet_hpi":
      return "Teranet HPI";
    case "sales":
      return "Sales";
    case "new_listings":
      return "New listings";
    case "active_listings":
      return "Active listings";
    case "snlr":
      return "Sales / New listings";
    case "moi":
      return "Months of inventory";
    case "policy_rate":
      return "BoC policy rate";
    case "mortgage_5y":
      return "5y mortgage rate";
    case "gov_2y_yield":
      return "2y GoC yield";
    case "gov_5y_yield":
      return "5y GoC yield";
    case "gov_10y_yield":
      return "10y GoC yield";
    case "mortgage_5y_spread":
      return "5y mortgage spread";
    case "avg_rent":
      return "Average rent";
    case "vacancy_rate":
      return "Vacancy rate";
    case "cpi_headline":
      return "Headline CPI";
    case "cpi_shelter":
      return "Shelter CPI";
    default:
      return metric.replace(/_/g, " ");
  }
}

export const MetricSnapshotCard: React.FC<Props> = ({ snapshot }) => {
  const { metric, latest, prev } = snapshot;

  const latestVal = latest?.value;
  const momPct =
    latest.mom_pct != null
      ? latest.mom_pct
      : prev && prev.value
      ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
      : null;

  const hasPrev = !!prev && Number.isFinite(prev.value);
  const deltaAbs =
    hasPrev && momPct != null ? latest.value - prev.value : null;

  const yoyPct = latest.yoy_pct;

  const yoyClass =
    "metric-card__secondary" +
    (yoyPct != null
      ? yoyPct > 0
        ? " metric-card__secondary--up"
        : yoyPct < 0
        ? " metric-card__secondary--down"
        : ""
      : "");

  return (
    <div className="metric-card">
      <div className="metric-card__title">{labelForMetric(metric)}</div>
      <div className="metric-card__value">
        {formatValue(latestVal, latest.unit)}
      </div>

      {momPct != null && hasPrev && deltaAbs != null && (
        <div className="metric-card__delta-row">
          <span
            className={
              "metric-card__delta-chip" +
              (momPct >= 0
                ? " metric-card__delta-chip--up"
                : " metric-card__delta-chip--down")
            }
          >
            {deltaAbs >= 0 ? "+" : ""}
            {formatValue(deltaAbs, latest.unit)}{" "}
            ({momPct >= 0 ? "+" : ""}
            {momPct.toFixed(1)}%)
            <span className="metric-card__delta-label"> MoM</span>
          </span>
        </div>
      )}

      {yoyPct != null && (
        <div className={yoyClass}>
          YoY: {yoyPct > 0 ? "+" : ""}
          {yoyPct.toFixed(1)}%
        </div>
      )}
    </div>
  );
};
