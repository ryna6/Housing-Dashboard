import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

type ValueKey = "mom_pct" | "yoy_pct" | "value";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: ValueKey;
}

export const ChartPanel: React.FC<Props> = ({ title, series, valueKey }) => {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map((p) => p.date.slice(0, 7)); // YYYY-MM
  const y = sorted.map((p) => {
    const v = p[valueKey] as number | null;
    return v == null ? NaN : v;
  });

  const isPct = valueKey === "mom_pct" || valueKey === "yoy_pct";

  const option = {
    title: {
      text: title,
      left: "center",
      textStyle: { fontSize: 12 }
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (val: number) =>
        isPct ? `${val.toFixed(2)}%` : val.toFixed(2)
    },
    grid: { left: 40, right: 10, top: 30, bottom: 30 },
    xAxis: {
      type: "category" as const,
      data: x,
      axisLabel: { fontSize: 10 }
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        formatter: isPct ? "{value} %" : "{value}"
      },
      splitLine: { show: true }
    },
    series: [
      {
        type: "line" as const,
        data: y,
        smooth: true,
        showSymbol: false
      }
    ]
  };

  return (
    <div className="chart-panel">
      {series.length === 0 ? (
        <div className="chart-panel__empty">No data yet</div>
      ) : (
        <ReactECharts option={option} notMerge lazyUpdate />
      )}
    </div>
  );
};
