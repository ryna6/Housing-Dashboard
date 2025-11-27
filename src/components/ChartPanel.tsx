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
  const x = sorted.map((p) => p.date.slice(0, 7));
  const y = sorted.map((p) => {
    const v = p[valueKey] as number | null;
    return v == null ? NaN : v;
  });

  const hasData = y.some((v) => Number.isFinite(v));

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

  const option = {
    grid: { left: 40, right: 16, top: 24, bottom: 24 },
    tooltip: {
      trigger: "axis"
    },
    xAxis: {
      type: "category",
      data: x,
      axisLine: { lineStyle: { opacity: 0.4 } },
      axisLabel: { fontSize: 10 }
    },
    yAxis: {
      type: "value",
      axisLine: { lineStyle: { opacity: 0.4 } },
      splitLine: { lineStyle: { opacity: 0.2 } },
      axisLabel: { fontSize: 10 }
    },
    series: [
      {
        type: "line",
        data: y,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 }
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
        style={{ width: "100%", height: 220 }}
      />
    </div>
  );
};
