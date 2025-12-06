import React, { useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

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
   * Optional formatter for numeric values in the tooltip. If omitted,
   * we fall back to valueFormatter, and then to a generic formatter.
   */
  tooltipValueFormatter?: (value: number) => string;
  /** Render as a step line (discrete jumps between periods). */
  step?: boolean;
  /**
   * Treat numeric values as percentages for formatting (0–5% etc),
   * even if the underlying valueKey is "value".
   */
  treatAsPercentScale?: boolean;
  /**
   * Clamp the y-axis minimum at 0
   * (e.g. policy rate, CPI, HPI).
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
  tooltipValueFormatter,
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

  // --- state for drag-to-measure range selection ---
  const chartRef = useRef<any>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

    if (clampYMinToZero) {
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

    if (clampYMinToZero) {
      min = Math.max(0, min);
    }

    yMin = min;
    yMax = max;
  }

  // ----- helpers for selection / formatting -----
  const formatSingleValue = (val: number): string => {
    if (isPercentScale) {
      return `${val.toFixed(2)}%`;
    }
    if (typeof tooltipValueFormatter === "function") {
      return tooltipValueFormatter(val);
    }
    if (typeof valueFormatter === "function") {
      return valueFormatter(val);
    }
    return val.toFixed(2);
  };

  const formatChangeValue = (delta: number): string => {
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
    const abs = Math.abs(delta);
    if (isPercentScale) {
      return `${sign}${abs.toFixed(2)}%`;
    }
    if (typeof tooltipValueFormatter === "function") {
      // assume formatter works for absolute values; we prepend sign
      return `${sign}${tooltipValueFormatter(abs)}`;
    }
    if (typeof valueFormatter === "function") {
      return `${sign}${valueFormatter(abs)}`;
    }
    return `${sign}${abs.toFixed(2)}`;
  };

  const getIndexFromEvent = (params: any): number | null => {
    if (!chartRef.current) return null;
    const ev = params?.event;
    if (!ev || typeof ev.offsetX !== "number" || typeof ev.offsetY !== "number") {
      return null;
    }

    // Convert pixel position to x-axis coordinate
    const pointInGrid = chartRef.current.convertFromPixel(
      { xAxisIndex: 0 },
      [ev.offsetX, ev.offsetY]
    );

    if (!pointInGrid || !Array.isArray(pointInGrid) || pointInGrid.length === 0) {
      return null;
    }

    const axisValue = pointInGrid[0];
    let idx: number;

    if (typeof axisValue === "number") {
      idx = Math.round(axisValue);
    } else {
      idx = x.indexOf(String(axisValue));
    }

    if (idx < 0 || idx >= x.length) {
      return null;
    }

    return idx;
  };

  const handleMouseDown = (params: any) => {
    // left-click only
    const native = params?.event?.event;
    if (native && "button" in native && native.button !== 0) return;

    const idx = getIndexFromEvent(params);
    if (idx == null) return;
    setDragStartIndex(idx);
    setDragEndIndex(idx);
    setIsDragging(true);
  };

  const handleMouseMove = (params: any) => {
    if (!isDragging || dragStartIndex == null) return;
    const idx = getIndexFromEvent(params);
    if (idx == null) return;
    if (idx !== dragEndIndex) {
      setDragEndIndex(idx);
    }
  };

  const finishDrag = (params?: any) => {
    if (!isDragging) return;

    const idx = params ? getIndexFromEvent(params) : null;
    if (idx != null && dragStartIndex != null) {
      if (idx === dragStartIndex) {
        // Click without drag: clear selection
        setDragStartIndex(null);
        setDragEndIndex(null);
      } else {
        setDragEndIndex(idx);
      }
    }
    setIsDragging(false);
  };

  const handleMouseUp = (params: any) => {
    finishDrag(params);
  };

  const handleGlobalOut = () => {
    // If mouse leaves chart while dragging, just end the drag
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const onEvents: Record<string, (params: any) => void> = {
    mousedown: handleMouseDown,
    mousemove: handleMouseMove,
    mouseup: handleMouseUp,
    globalout: handleGlobalOut,
  };

  // Compute current selection summary (if any)
  let selectionText: string | null = null;
  let selectionColor: string | undefined;

  if (
    dragStartIndex != null &&
    dragEndIndex != null &&
    dragStartIndex !== dragEndIndex
  ) {
    const startIdx = Math.min(dragStartIndex, dragEndIndex);
    const endIdx = Math.max(dragStartIndex, dragEndIndex);

    const startVal = y[startIdx];
    const endVal = y[endIdx];

    if (
      typeof startVal === "number" &&
      !Number.isNaN(startVal) &&
      typeof endVal === "number" &&
      !Number.isNaN(endVal)
    ) {
      const delta = endVal - startVal;
      const pct =
        startVal === 0 ? null : (delta / Math.abs(startVal)) * 100;

      const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "";
      selectionColor =
        delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : undefined; // green / red

      const absText = formatChangeValue(delta);
      const pctText =
        pct == null ? "" : ` (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)`;

      selectionText = `${x[startIdx]} → ${x[endIdx]}: ${arrow} ${absText}${pctText}`;
    }
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
        } else if (typeof tooltipValueFormatter === "function") {
          // Use tooltip-specific formatter if provided
          formatted = tooltipValueFormatter(val);
        } else if (typeof valueFormatter === "function") {
          // Fallback to axis formatter
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
      <div className="chart-panel__title">
        {title}
        {selectionText && (
          <span
            className="chart-panel__selection-summary"
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: "nowrap",
              color: selectionColor,
            }}
          >
            {selectionText}
          </span>
        )}
      </div>
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{
          width: "100%",
          height: 190,
          cursor: isDragging ? "crosshair" : "default",
        }}
        onChartReady={(chart) => {
          chartRef.current = chart;
        }}
        onEvents={onEvents}
      />
    </div>
  );
};
