import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";
  /** Optional label for Y axis (e.g. "%", "bps", "index"). */
  valueAxisLabel?: string;
}

export const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  valueAxisLabel,
}) => {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map((p) => p.date.slice(0, 7)); // YYYY-MM
  const y = sorted.map((p) => {
    const raw = p[valueKey] as number | null;
    return raw == null ? NaN : raw;
  });

  const hasData =
    sorted.length > 0 && y.some((v) => typeof v === "number" && !Number.isNaN(v));

  if (!hasData) {
    return (
      <div className="chart-panel chart-panel--empty">
        <div className="chart-panel__title">{title}</div>
        <div className="chart-panel__empty-message">
          Not available for this selection
        </div>
      </div>
    );
  }

  const isPctChange = valueKey === "mom_pct" || valueKey === "yoy_pct";
  const isPercentScale = isPctChange || valueAxisLabel === "%";

  const option = {
    title: {
      text: title,
      left: "left",
      top: 0,
      textStyle: {
        fontSize: 13,
        fontWeight: 600,
        color: "#f5f5f5", // more visible title
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const value: number =
          p && typeof p.data === "number" ? (p.data as number) : NaN;
        const axisValue = p && p.axisValue ? String(p.axisValue) : "";
        if (Number.isNaN(value)) return axisValue;

        const valueStr = isPercentScale
          ? `${value.toFixed(2)}%`
          : value.toFixed(2);

        return `${axisValue}<br/>${valueStr}`;
      },
    },
    grid: { left: 40, right: 10, top: 35, bottom: 40 },
    xAxis: {
      type: "category",
      data: x,
      axisLabel: {
        formatter: (val: string) => val,
      },
    },
    yAxis: {
      type: "value",
      name: isPercentScale ? "%" : valueAxisLabel ?? "",
      axisLabel: {
        formatter: (val: number) => {
          if (Number.isNaN(val)) return "";
          if (isPercentScale) {
            // Show as 0%, 1%, 2%, ...
            return `${val.toFixed(0)}%`;
          }
          return val.toFixed(0);
        },
      },
    },
    series: [
      {
        type: "line",
        data: y,
        smooth: true,
        showSymbol: false,
        connectNulls: true,
      },
    ],
  };

  return (
    <div className="chart-panel">
      <ReactECharts option={option} notMerge lazyUpdate />
    </div>
  );
};
