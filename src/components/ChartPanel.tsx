import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";
  /** Optional label for the Y axis when plotting raw values (e.g. "bps"). */
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

  const option = {
    title: {
      text: title,
      left: "left",
      top: 0,
      textStyle: { fontSize: 11 },
    },
    tooltip: {
      trigger: "axis",
    },
    grid: { left: 40, right: 10, top: 30, bottom: 40 },
    xAxis: {
      type: "category",
      data: x,
      axisLabel: {
        formatter: (val: string) => val,
      },
    },
    yAxis: {
      type: "value",
      name: isPctChange ? "%" : valueAxisLabel ?? "",
      axisLabel: {
        formatter: (val: number) => {
          if (Number.isNaN(val)) return "";
          if (isPctChange) return `${val.toFixed(1)}%`; // MoM/YoY % charts
          // Raw values (e.g. basis points)
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
