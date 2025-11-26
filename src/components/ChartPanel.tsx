import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "mom_pct" | "yoy_pct" | "value";
}

export const ChartPanel: React.FC<Props> = ({ title, series, valueKey }) => {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map(p => p.date.slice(0, 7)); // YYYY-MM
  const y = sorted.map(p => (p[valueKey] as number | null) ?? NaN);

  const option = {
    title: { text: title, left: "center", textStyle: { fontSize: 12 } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (val: number) => `${val.toFixed(2)}%`,
    },
    grid: { left: 40, right: 10, top: 30, bottom: 30 },
    xAxis: {
      type: "category",
      data: x,
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        formatter: "{value} %",
      },
      splitLine: { show: true },
    },
    series: [
      {
        type: "line",
        data: y,
        smooth: true,
        showSymbol: false,
      },
    ],
  };

  return (
    <div className="chart-panel">
      <ReactECharts option={option} notMerge lazyUpdate />
    </div>
  );
};

