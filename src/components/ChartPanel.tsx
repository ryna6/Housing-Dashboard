import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";
  /** Optional label for the y-axis (left blank by default). */
  valueAxisLabel?: string;
  /** Optional formatter for numeric values (axis ticks + tooltip) when not using percent scale. */
  valueFormatter?: (value: number) => string;
  /** Render as a step line (discrete jumps between months). */
  step?: boolean;
  /**
   * Treat numeric values as percentages for formatting (0–5% etc),
   * even if the underlying valueKey is "value".
   */
  treatAsPercentScale?: boolean;
  /**
   * For percent-style series, clamp the y-axis minimum at 0
   * (e.g. policy rate, mortgage rate).
   */
  clampYMinToZero?: boolean;
}

// Simple "nice number" helper for tick steps: 1, 2, 5 × 10^k
function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = rawStep / Math.pow(10, exp); // between 1 and 10
  let niceBase: number;

  if (base < 1.5) niceBase = 1;
  else if (base < 3) niceBase = 2;
  else if (base < 7) niceBase = 5;
  else niceBase = 10;

  return niceBase * Math.pow(10, exp);
}

export const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  valueAxisLabel,
  valueFormatter,
  step = false,
  treatAsPercentScale,
  clampYMinToZero = false,
}) => {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map((p) => p.date.slice(0, 7)); // YYYY-MM
  const y = sorted.map((p) => {
    const v = p[valueKey] as number | null;
    return v == null ? NaN : v;
  });

  const numeric = y.filter(
    (v) => typeof v === "number" && !Number.isNaN(v)
  ) as number[];

  const hasData = sorted.length > 0 && numeric.length > 0;

  const isPercentScale =
    treatAsPercentScale ??
    (valueKey === "mom_pct" || valueKey === "yoy_pct");

  if (!hasData) {
    return (
      <div className="chart-panel chart-panel--empty">
        <div className="chart-panel__title">{title}</div>
        <div className="chart-panel__empty-text">
          Not available for this selection.
        </div>
      </div>
    );
  }

  // ----- Y-axis bounds with "±1 step" logic -----
  let yMin: number | undefined;
  let yMax: number | undefined;
  let interval: number | undefined;

  const rawMin = Math.min(...numeric);
  const rawMax = Math.max(...numeric);

  if (rawMin === rawMax) {
    // Flat series: pick a reasonable step based on magnitude
    const base = Math.abs(rawMin) || 1;
    const rough = base / 3;
    const stepSize = niceStep(rough);
    interval = stepSize;

    let min = rawMin - stepSize;
    let max = rawMax + stepSize;

    if (isPercentScale && clampYMinToZero) {
      min = Math.max(0, min);
    }

    yMin = min;
    yMax = max;
  } else {
    const range = rawMax - rawMin;
    const targetTicks = 5;
    const rough = range / (targetTicks - 1 || 1);
    const stepSize = niceStep(rough);
    interval = stepSize;

    const niceMin = Math.floor(rawMin / stepSize) * stepSize;
    const niceMax = Math.ceil(rawMax / stepSize) * stepSize;

    let min = niceMin - stepSize; // one extra step below
    let max = niceMax + stepSize; // one extra step above

    if (isPercentScale && clampYMinToZero) {
      min = Math.max(0, min);
    }

    yMin = min;
    yMax = max;
  }

  const option: any = {
    grid: { left: 40, right: 16, top: 8, bottom: 28 },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const axisValue = p && p.axisValue ? String(p.axisValue) : "";
        const val =
          p && typeof p.data === "number" ? (p.data as number) : NaN;
        if (Number.isNaN(val)) return axisValue;

        let formatted: string;
        if (isPercentScale) {
          formatted = `${val.toFixed(2)}%`;
        } else if (typeof valueFormatter === "function") {
          formatted = valueFormatter(val);
        } else {
          formatted = val.toFixed(2);
        }

        return `${axisValue}<br/>${formatted}`;
      },
    },

    xAxis: {
      type: "category",
      data: x,
      axisLine: { lineStyle: { opacity: 0.4 } },
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: valueAxisLabel ?? "",
      min: yMin,
      max: yMax,
      interval,
      axisLine: { lineStyle: { opacity: 0.4 } },
      splitLine: { lineStyle: { opacity: 0.2 } },
      axisLabel: {
        fontSize: 10,
        formatter: (val: number) => {
          if (Number.isNaN(val)) return "";
          if (isPercentScale) {
            return `${val.toFixed(0)}%`;
          }
          if (typeof valueFormatter === "function") {
            return valueFormatter(val);
          }
          return val.toFixed(0);
        },
      },
    },

    series: [
      {
        type: "line",
        data: y,
        showSymbol: false,
        connectNulls: true,
        smooth: !step,
        step: step ? "end" : undefined,
      },
    ],
  };

  return (
    <div className="chart-panel">
      <div className="chart-panel__title">{title}</div>
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: 190 }}
      />
    </div>
  );
};
