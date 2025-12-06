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
 * Metrics that should show "change vs previous rate"
 * instead of a normal MoM / QoQ label.
 */
const VS_PREVIOUS_RATE_METRICS = new Set<string>([
  "policy_rate",
  "mortgage_5y",
]);

/**
 * Rentals tab metrics that are quarterly and should say "QoQ"
 * instead of "MoM" on the delta chip.
 */
const QUARTERLY_RENTAL_METRICS = new Set<string>([
  "rent_level",
  "rent_to_income",
  "price_to_rent",
]);

/**
 * Rentals tab vacancy metric – annual; we show only YoY.
 */
const VACANCY_METRICS = new Set<string>(["rental_vacancy_rate"]);

// More detailed formatting for rent-level metrics (e.g. "$2.45k")
function formatRentLevelValue(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}k`;
  }

  return `$${value.toFixed(1)}`;
}

function formatValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "–";

  if (unit === "pct") {
    // 2 decimal places for interest rates / percentages
    return `${value.toFixed(2)}%`;
  }

  if (unit === "cad") {
    const abs = Math.abs(value);

    if (abs >= 1_000_000_000_000) {
      // Trillions
      return `$${(value / 1_000_000_000_000).toFixed(3)}T`;
    }
    if (abs >= 1_000_000_000) {
      // Billions
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (abs >= 1_000_000) {
      // Millions
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
      // Thousands
      return `$${(value / 1_000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  }

  if (unit === "index") {
    return value.toFixed(1);
  }

  if (unit === "months") {
    // e.g. 3.4 months of inventory
    return `${value.toFixed(1)} months`;
  }

  if (unit === "count") {
    // Compact notation for large counts: 100K, 1.0M, etc.
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(1)}k`;
    }
    return value.toFixed(0);
  }

  // Fallback
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

    case "new_listings":
      return "New listings";
    case "active_listings":
      return "Active listings";
    case "snlr":
      return "Sales / New listings";
    case "moi":
      return "Months of inventory";
    case "absorption_rate":
      return "Absorption rate";

    case "policy_rate":
      return "BoC policy rate";
    case "mortgage_5y":
      return "5y mortgage rate";
    case "repo_volume":
      return "Overnight repo volume";

    case "gov_2y_yield":
      return "2y GoC yield";
    case "gov_5y_yield":
      return "5y GoC yield";
    case "gov_10y_yield":
      return "10y GoC yield";

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

    // Rentals tab metrics
    case "rent_level":
      return "Rent cost";
    case "rent_to_income":
      return "Rent-to-income";
    case "price_to_rent":
      return "Price-to-rent";
    case "rental_vacancy_rate":
      return "Rental vacancy rate";

    default:
      return metric.replace(/_/g, " ");
  }
}

export const MetricSnapshotCard: React.FC<Props> = ({
  snapshot,
  titleOverride,
}) => {
  const { metric, latest, prev } = snapshot;

  // Ensure we always have a number for formatting
  const latestVal = latest?.value ?? NaN;
  const yoyPct = latest.yoy_pct ?? null;

  const useVsPreviousRate = VS_PREVIOUS_RATE_METRICS.has(metric);
  const isQuarterlyRental = QUARTERLY_RENTAL_METRICS.has(metric);
  const isVacancy = VACANCY_METRICS.has(metric);

  // YoY styling (green up / red down) – not used for vacancy (custom chip).
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

  if (isVacancy) {
    // Annual vacancy rate: show a single YoY chip, no separate YoY line.
    if (prev && Number.isFinite(prev.value) && Number.isFinite(latestVal)) {
      const absDelta = latest.value - prev.value;

      const effectiveYoyPct =
        yoyPct != null && Number.isFinite(yoyPct)
          ? yoyPct
          : prev.value !== 0
          ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
          : null;

      const chipClass =
        "metric-card__delta-chip" +
        (effectiveYoyPct != null
          ? effectiveYoyPct > 0
            ? " metric-card__delta-chip--up"
            : effectiveYoyPct < 0
            ? " metric-card__delta-chip--down"
            : ""
          : "");

      deltaNode = (
        <div className="metric-card__delta-row">
          <span className={chipClass}>
            {absDelta > 0 ? "+" : ""}
            {formatDelta(absDelta, latest.unit)}{" "}
            {effectiveYoyPct != null && (
              <>
                (
                {effectiveYoyPct > 0 ? "+" : ""}
                {effectiveYoyPct.toFixed(1)}%)
              </>
            )}
            <span className="metric-card__delta-label"> YoY</span>
          </span>
        </div>
      );
    }
  } else if (useVsPreviousRate) {
    // For policy_rate & mortgage_5y: "Δ … vs previous rate"
    if (prev && Number.isFinite(prev.value) && Number.isFinite(latestVal)) {
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
    // All other metrics (including rentals): generic period-over-period change.
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

      const label = isQuarterlyRental ? "QoQ" : "MoM";

      deltaNode = (
        <div className="metric-card__delta-row">
          <span className={chipClass}>
            {absDelta > 0 ? "+" : ""}
            {formatDelta(absDelta, latest.unit)}{" "}
            {momPct != null && (
              <>
                (
                {momPct > 0 ? "+" : ""}
                {momPct.toFixed(1)}%)
              </>
            )}
            <span className="metric-card__delta-label"> {label}</span>
          </span>
        </div>
      );
    }
  }

  let yoyNode: React.ReactNode = null;
  if (!isVacancy && yoyPct != null) {
    yoyNode = (
      <div className={yoyClass}>
        YoY: {yoyPct > 0 ? "+" : ""}
        {yoyPct.toFixed(1)}%
      </div>
    );
  }

  return (
    <div className="metric-card">
      <div className="metric-card__title">
        {titleOverride ?? labelForMetric(metric)}
      </div>
      <div className="metric-card__value">
        {metric === "rent_level" && latest.unit === "cad"
          ? formatRentLevelValue(latestVal)
          : formatValue(latestVal, latest.unit)}
      </div>

      {deltaNode}

      {yoyNode}
    </div>
  );
};
