import React from "react";
import type { PanelPoint } from "../data/types";

interface Snapshot {
  metric: string;
  latest: PanelPoint;
  prev: PanelPoint | null;
}

interface Props {
  snapshot: Snapshot;
}

export const MetricSnapshotCard: React.FC<Props> = ({ snapshot }) => {
  const { metric, latest, prev } = snapshot;
  const deltaAbs = prev ? latest.value - prev.value : null;
  const deltaPct = prev && prev.value !== 0
    ? (latest.value / prev.value - 1) * 100
    : null;

  const signClass =
    deltaPct == null ? "" : deltaPct > 0 ? "metric-card__delta--up" : "metric-card__delta--down";

  const formatVal = (v: number) =>
    metric.includes("price") || latest.unit.startsWith("$")
      ? v.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
      : latest.unit === "percent"
      ? `${v.toFixed(1)}%`
      : v.toLocaleString("en-CA", { maximumFractionDigits: 1 });

  return (
    <div className="metric-card">
      <div className="metric-card__label">{metric}</div>
      <div className="metric-card__value">
        {formatVal(latest.value)}{" "}
        <span className="metric-card__unit">{latest.unit}</span>
      </div>
      {deltaPct != null && (
        <div className={`metric-card__delta ${signClass}`}>
          {deltaAbs !== null ? formatVal(deltaAbs) : ""} (
          {deltaPct > 0 ? "+" : ""}
          {deltaPct.toFixed(1)}%)
          <span className="metric-card__delta-label"> MoM</span>
        </div>
      )}
      {latest.yoy_pct != null && (
        <div className="metric-card__secondary">
          YoY: {latest.yoy_pct > 0 ? "+" : ""}
          {latest.yoy_pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
};

