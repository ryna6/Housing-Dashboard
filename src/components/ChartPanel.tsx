import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";
import "./ChartPanel.css";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";

  /** Optional label for the y-axis (left blank by default). */
  valueAxisLabel?: string;

  /**
   * Optional formatter for numeric values on the Y-axis ticks
   * when not using percent scale.
   */
  valueFormatter?: (value: number) => string;

  /**
   * Optional formatter used just for tooltips; if not provided,
   * `valueFormatter` (or the default percent formatter) is used.
   */
  tooltipValueFormatter?: (value: number) => string;

  /**
   * Whether to draw the line as a step-wise series (good for
   * policy rates).
   */
  step?: boolean;

  /**
   * If true, interpret data as percentages and show "%" in
   * axis labels + tooltips.
   */
  treatAsPercentScale?: boolean;

  /**
   * If true and all values are positive, clamp the Y-axis
   * minimum at 0 instead of auto-fitting.
   */
  clampYMinToZero?: boolean;
}

/**
 * Reasonable default formatter when caller doesn't provide one.
 * - Uses compact K/M/B units for large values.
 * - Falls back to 2 decimal places for smaller values.
 * - If treatAsPercentScale is true, we append "%".
 */
function makeDefaultFormatter(treatAsPercentScale: boolean | undefined) {
  return (value: number): string => {
    if (!Number.isFinite(value)) return "-";

    const abs = Math.abs(value);
    let base: string;

    if (abs >= 1_000_000_000) {
      base = (value / 1_000_000_000).toFixed(1) + "B";
    } else if (abs >= 1_000_000) {
      base = (value / 1_000_000).toFixed(1) + "M";
    } else if (abs >= 1_000) {
      base = (value / 1_000).toFixed(1) + "K";
    } else {
      base = value.toFixed(2);
    }

    return treatAsPercentScale ? `${base}%` : base;
  };
}

export const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  valueAxisLabel,
  valueFormatter,
  tooltipValueFormatter,
  step,
  treatAsPercentScale,
  clampYMinToZero,
}) => {
  // Sort by date just to be safe
  const sorted = useMemo(
    () =>
      [...series].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      ),
    [series]
  );

  // Early "no data" state, same wording the rest of the app uses
  if (!sorted.length) {
    return (
      <div className="chart-panel chart-panel--empty">
        <div className="chart-panel__header">
          <h3 className="chart-panel__title">{title}</h3>
        </div>
        <div className="chart-panel__empty">Not available for this selection.</div>
      </div>
    );
  }

  const xData = sorted.map((p) => p.date);
  const rawValues = sorted.map((p) => {
    const v = p[valueKey] as number | null | undefined;
    return v == null ? NaN : v;
  });

  const axisFormatter =
    valueFormatter ?? makeDefaultFormatter(treatAsPercentScale);
  const tooltipFormatter =
    tooltipValueFormatter ?? axisFormatter;

  // Decide Y-min for clamp-to-zero behavior
  const yMin = useMemo(() => {
    const vals = rawValues.filter((v) => Number.isFinite(v)) as number[];
    if (!vals.length) return undefined;

    const min = Math.min(...vals);
    if (clampYMinToZero && min > 0) {
      return 0;
    }
    return undefined; // let ECharts auto-scale
  }, [rawValues, clampYMinToZero]);

  // ─────────────────────────────────────
  //  Drag-to-measure state
  // ─────────────────────────────────────
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [rangeInfo, setRangeInfo] = useState<{
    startIndex: number;
    endIndex: number;
    startDate: string;
    endDate: string;
    delta: number;
    pctChange: number | null;
  } | null>(null);

  const handleMouseDown = (params: any) => {
    if (typeof params?.dataIndex === "number") {
      setDragStartIndex(params.dataIndex);
      setRangeInfo(null);
    }
  };

  const handleMouseUp = (params: any) => {
    if (dragStartIndex == null) return;
    if (typeof params?.dataIndex !== "number") {
      setDragStartIndex(null);
      return;
    }

    const start = dragStartIndex;
    const end = params.dataIndex;

    if (start === end) {
      // treat as click, not a drag
      setDragStartIndex(null);
      return;
    }

    const i0 = Math.min(start, end);
    const i1 = Math.max(start, end);

    const v0 = rawValues[i0];
    const v1 = rawValues[i1];

    if (!Number.isFinite(v0) || !Number.isFinite(v1)) {
      setDragStartIndex(null);
      return;
    }

    const delta = (v1 as number) - (v0 as number);
    const pctChange =
      v0 && v0 !== 0 ? ((v1 as number) - (v0 as number)) / (v0 as number) * 100 : null;

    setRangeInfo({
      startIndex: i0,
      endIndex: i1,
      startDate: xData[i0],
      endDate: xData[i1],
      delta,
      pctChange,
    });
    setDragStartIndex(null);
  };

  const onEvents = {
    mousedown: handleMouseDown,
    mouseup: handleMouseUp,
  };

  // Formatting for the drag range summary
  const formatDeltaValue = (value: number): string => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    if (treatAsPercentScale) {
      // If the underlying series is already in %, delta is in percentage points
      return `${sign}${Math.abs(value).toFixed(2)}%`;
    }
    return `${sign}${axisFormatter(Math.abs(value))}`;
  };

  const formatPctChange = (pct: number | null): string => {
    if (pct == null || !Number.isFinite(pct)) return "";
    const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
    return `${sign}${Math.abs(pct).toFixed(2)}%`;
  };

  const rangeColor =
    rangeInfo && rangeInfo.delta < 0 ? "#b91c1c" : "#15803d"; // red / green

  // ─────────────────────────────────────
  //  ECharts option
  // ─────────────────────────────────────
  const option: any = {
    grid: {
      left: 60,
      right: 16,
      top: 32,
      bottom: 48,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      valueFormatter: (v: any) => {
        const num = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(num)) return "-";
        if (treatAsPercentScale) {
          return tooltipFormatter(num);
        }
        return tooltipFormatter(num);
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xData,
      axisLabel: {
        formatter: (value: string) => value,
      },
    },
    yAxis: {
      type: "value",
      min: yMin,
      name: valueAxisLabel,
      nameLocation: "middle",
      nameGap: 44,
      axisLabel: {
        formatter: (val: number) => {
          if (!Number.isFinite(val)) return "";
          return axisFormatter(val);
        },
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: "dashed",
        },
      },
    },
    series: [
      {
        type: "line",
        name: title,
        data: rawValues,
        showSymbol: false,
        smooth: false,
        step: step ? "middle" : false,
        lineStyle: {
          width: 2,
        },
        emphasis: {
          focus: "series",
        },
      },
    ],
    dataZoom: [
      {
        type: "inside",
        throttle: 50,
      },
      {
        type: "slider",
        height: 20,
        bottom: 8,
      },
    ],
  };

  return (
    <div className="chart-panel">
      <div className="chart-panel__header">
        <h3 className="chart-panel__title">{title}</h3>
      </div>

      {rangeInfo && (
        <div
          className="chart-panel__range-delta"
          style={{
            marginTop: 4,
            marginBottom: 4,
            fontSize: 12,
            fontWeight: 500,
            color: rangeColor,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span className="chart-panel__range-delta-dates">
            {rangeInfo.startDate} → {rangeInfo.endDate}
          </span>
          <span className="chart-panel__range-delta-values">
            {formatDeltaValue(rangeInfo.delta)}
            {rangeInfo.pctChange != null && (
              <> ({formatPctChange(rangeInfo.pctChange)})</>
            )}
          </span>
        </div>
      )}

      <div className="chart-panel__chart">
        <ReactECharts option={option} onEvents={onEvents} />
      </div>
    </div>
  );
};
