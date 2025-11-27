import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";
  /** Optional label for the y-axis, e.g. "%" for rate levels. */
  valueAxisLabel?: string;
  /** Render as a step line (discrete jumps between months). */
  step?: boolean;
}

export const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  valueAxisLabel,
  step = false
}) => {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map((p) => p.date.slice(0, 7));
  const y = sorted.map((p) => {
    const v = p[valueKey] as number | null;
    return v == null ? NaN : v;
  });

  const hasData =
    sorted.length > 0 &&
    y.some((v) => typeof v === "number" && !Number.isNaN(v));

  const isPctSeries =
    valueKey === "mom_pct" ||
    valueKey === "yoy_pct" ||
    valueAxisLabel === "%";

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

        const formatted = isPctSeries
          ? `${val.toFixed(2)}%`
          : val.toFixed(2);

        return `${axisValue}<br/>${formatted}`;
      }
    },
    xAxis: {
      type: "category",
      data: x,
      axisLine: { lineStyle: { opacity: 0.4 } },
      axisLabel: { fontSize: 10 }
    },
    yAxis: {
      type: "value",
      name: isPctSeries ? "%" : valueAxisLabel ?? "",
      axisLine: { lineStyle: { opacity: 0.4 } },
      splitLine: { lineStyle: { opacity: 0.2 } },
      axisLabel: {
        fontSize: 10,
        formatter: (val: number) => {
          if (Number.isNaN(val)) return "";
          if (isPctSeries) {
            // 0%, 1%, 2%, ...
            return `${val.toFixed(0)}%`;
          }
          return val.toFixed(0);
        }
      }
    },
    series: [
      {
        type: "line",
        data: y,
        showSymbol: false,
        connectNulls: true,
        smooth: !step,
        // For policy/mortgage rates: vertical jumps between months
        step: step ? "end" : undefined
      }
    ]
  };

  return (
    <div className="chart-panel">
      <div className="chart-panel__title">{title}</div>
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: 260 }}
      />
    </div>
  );
};
