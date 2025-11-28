import React from "react";
import type { PanelPoint } from "../data/types";

export interface MetricSnapshot {
  metric: string;
  latest: PanelPoint;
  prev: PanelPoint | null;
}

interface Props {
  snapshot: MetricSnapshot;
  /**
   * Optional override for the card title.
   * If not provided, we fall back to a label based on the metric name.
   */
  titleOverride?: string;
}

/**
 * Metrics that should show "change vs previous rate" instead of "MoM":
 * - Bank of Canada policy rate
 * - 5-year mortgage / prime proxy
 */
const VS_PREVIOUS_RATE_METRICS = new Set<string>(["policy_rate", "mortgage_5y"]);

function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "–";

  if (unit === "pct") {
    // 2 decimal places for interest rates / percentages
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

  if (unit === "count") {
    return value.toLocaleString("en-CA");
  }

  return value.toFixed(2);
}

function formatDelta(value: number, unit: string): string {
  if (unit === "pct") {
    return `${value.toFixed(2)}%`;
  }
  return formatValue(value, unit);
}

function labelForMetric(metric: string): string {
  switch (metric) {
    case "hpi_benchmark":
      return "Benchmark HPI";
    case "hpi_type":
      return "Housing type HPI";
    case "avg_price":
      return "Average price";

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
      return "5y mortgage prime rate";

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
      return "Owned Accommodation CPI";
    case "cpi_rent":
      return "Rent CPI";
    case "wage_index":
      return "Wage Index ($/week)";
    case "unemployment_rate":
      return "Unemployment Rate";

    default:
      return metric.replace(/_/g, " ");
  }
}

export const MetricSnapshotCard: React.FC<Props> = ({ snapshot, titleOverride }) => {
  const { metric, latest, prev } = snapshot;

  const latestVal = latest?.value;
  const yoyPct = latest.yoy_pct ?? null;
  const useVsPreviousRate = VS_PREVIOUS_RATE_METRICS.has(metric);

  // YoY styling (green up / red down)
  const yoyClass =
    "metric-card__secondary" +
    (yoyPct != null
      ? yoyPct > 0
        ? " metric-card__secondary--up"
        : yoyPct < 0
        ? " metric-card__secondary--down"
        : ""
      : "");

  let deltaNode: React.ReactNode = null;

  if (useVsPreviousRate) {
    // For policy_rate & mortgage_5y: "Δ … vs previous rate"
    if (prev && Number.isFinite(prev.value) && latestVal != null) {
      const absDelta = latest.value - prev.value;

      if (absDelta !== 0) {
        const relPct =
          prev.value !== 0
            ? (absDelta / Math.abs(prev.value)) * 100
            : null;

        const chipClass =
          "metric-card__delta-chip" +
          (absDelta > 0
            ? " metric-card__delta-chip--up"
            : " metric-card__delta-chip--down");

        deltaNode = (
          <div className="metric-card__delta-row">
            <span className={chipClass}>
              {absDelta > 0 ? "+" : ""}
              {formatDelta(absDelta, latest.unit)}{" "}
              {relPct != null && (
                <>
                  (
                  {relPct > 0 ? "+" : ""}
                  {relPct.toFixed(1)}%)
                </>
              )}
              <span className="metric-card__delta-label">
                {" "}
                vs previous rate
              </span>
            </span>
          </div>
        );
      }
    }
  } else {
    // All other metrics (including 2y/10y yields): classic MoM change
    const hasPrev = !!prev && Number.isFinite(prev.value);
    const momPct =
      latest.mom_pct != null
        ? latest.mom_pct
        : hasPrev && prev
        ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
        : null;

    if (hasPrev && momPct != null) {
      const absDelta = latest.value - prev!.value;
      const chipClass =
        "metric-card__delta-chip" +
        (momPct > 0
          ? " metric-card__delta-chip--up"
          : momPct < 0
          ? " metric-card__delta-chip--down"
          : "");

      deltaNode = (
        <div className="metric-card__delta-row">
          <span className={chipClass}>
            {absDelta > 0 ? "+" : ""}
            {formatDelta(absDelta, latest.unit)}{" "}
            (
            {momPct > 0 ? "+" : ""}
            {momPct.toFixed(1)}%)
            <span className="metric-card__delta-label"> MoM</span>
          </span>
        </div>
      );
    }
  }

  return (
    <div className="metric-card">
      <div className="metric-card__title">
        {titleOverride ?? labelForMetric(metric)}
      </div>
      <div className="metric-card__value">
        {formatValue(latestVal, latest.unit)}
      </div>

      {deltaNode}

      {yoyPct != null && (
        <div className={yoyClass}>
          YoY: {yoyPct > 0 ? "+" : ""}
          {yoyPct.toFixed(1)}%
        </div>
      )}
    </div>
  );
};
