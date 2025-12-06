import React, { useEffect, useMemo, useRef, useState } from "react";
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type RangeSelection = { start: number; end: number };

type RangeSummary = {
  startIdx: number;
  endIdx: number;
  startLabel: string;
  endLabel: string;
  startVal: number;
  endVal: number;
  delta: number;
  pctChange: number | null;
};

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
  const chartRef = useRef<any>(null);

  // Keep the latest data available to the drag handlers without re-binding events.
  const xRef = useRef<string[]>([]);

  const [range, setRange] = useState<RangeSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const x = sorted.map((p) => p.date.slice(0, 7)); // YYYY-MM
  const y = sorted.map((p) => {
    const v = p[valueKey] as number | null;
    return v == null ? NaN : v;
  });

  xRef.current = x;

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

  // Format numeric values consistently with the existing tooltip/axis behavior.
  const formatValueForDisplay = (val: number): string => {
    if (Number.isNaN(val)) return "–";

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

  const rangeSummary: RangeSummary | null = useMemo(() => {
    if (!range) return null;
    if (x.length === 0) return null;

    const maxIdx = x.length - 1;
    const s = clamp(range.start, 0, maxIdx);
    const e = clamp(range.end, 0, maxIdx);
    const i0 = Math.min(s, e);
    const i1 = Math.max(s, e);

    // Ignore degenerate selections (single point); only show when a real range exists.
    if (i0 === i1) return null;

    // Find the first/last finite values inside the selected span (handles missing data).
    let startIdx: number | null = null;
    for (let i = i0; i <= i1; i++) {
      const v = y[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        startIdx = i;
        break;
      }
    }

    let endIdx: number | null = null;
    for (let i = i1; i >= i0; i--) {
      const v = y[i];
      if (typeof v === "number" && Number.isFinite(v)) {
        endIdx = i;
        break;
      }
    }

    if (startIdx == null || endIdx == null) return null;
    if (startIdx === endIdx) return null;

    const startVal = y[startIdx];
    const endVal = y[endIdx];
    if (!Number.isFinite(startVal) || !Number.isFinite(endVal)) return null;

    const delta = (endVal as number) - (startVal as number);
    const pctChange =
      startVal !== 0
        ? (delta / Math.abs(startVal as number)) * 100
        : null;

    return {
      startIdx,
      endIdx,
      startLabel: x[startIdx],
      endLabel: x[endIdx],
      startVal: startVal as number,
      endVal: endVal as number,
      delta,
      pctChange,
    };
  }, [range, x, y]);

  // Click/hold/drag (Google Finance-style): show Δ and %Δ over an arbitrary range.
  useEffect(() => {
    if (!chartReady || !hasData) return;

    const ec = chartRef.current?.getEchartsInstance?.();
    if (!ec) return;

    const zr = ec.getZr();
    let pointerDown = false;

    const getIndexFromPointerEvent = (e: any): number | null => {
      const xNow = xRef.current;
      if (!xNow || xNow.length === 0) return null;

      const ox =
        typeof e?.offsetX === "number"
          ? e.offsetX
          : typeof e?.zrX === "number"
          ? e.zrX
          : typeof e?.x === "number"
          ? e.x
          : null;

      const oy =
        typeof e?.offsetY === "number"
          ? e.offsetY
          : typeof e?.zrY === "number"
          ? e.zrY
          : typeof e?.y === "number"
          ? e.y
          : null;

      if (typeof ox !== "number" || typeof oy !== "number") return null;

      const point: [number, number] = [ox, oy];
      const inGrid = ec.containPixel({ gridIndex: 0 }, point);
      if (!inGrid) return null;

      let coord: any = null;
      try {
        coord = ec.convertFromPixel({ seriesIndex: 0 }, point);
      } catch {
        // ignore
      }

      const xCoord = Array.isArray(coord) ? coord[0] : coord;

      if (typeof xCoord === "string") {
        const idx = xNow.indexOf(xCoord);
        return idx >= 0 ? idx : null;
      }

      if (typeof xCoord === "number" && Number.isFinite(xCoord)) {
        return clamp(Math.round(xCoord), 0, Math.max(0, xNow.length - 1));
      }

      // Fallback: convert against the xAxis if series conversion didn't resolve.
      try {
        const axisCoord: any = ec.convertFromPixel({ xAxisIndex: 0 }, point);
        const v = Array.isArray(axisCoord) ? axisCoord[0] : axisCoord;

        if (typeof v === "string") {
          const idx = xNow.indexOf(v);
          return idx >= 0 ? idx : null;
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          return clamp(Math.round(v), 0, Math.max(0, xNow.length - 1));
        }
      } catch {
        // ignore
      }

      return null;
    };

    const onDown = (e: any) => {
      const idx = getIndexFromPointerEvent(e);
      if (idx == null) return;
      pointerDown = true;
      setIsDragging(true);
      setRange({ start: idx, end: idx });
    };

    const onMove = (e: any) => {
      if (!pointerDown) return;
      const idx = getIndexFromPointerEvent(e);
      if (idx == null) return;
      setRange((prev) => {
        if (!prev) return { start: idx, end: idx };
        if (prev.end === idx) return prev;
        return { ...prev, end: idx };
      });
    };

    const onUp = () => {
      if (!pointerDown) return;
      pointerDown = false;
      setIsDragging(false);
    };

    zr.on("mousedown", onDown);
    zr.on("mousemove", onMove);
    zr.on("mouseup", onUp);
    zr.on("globalout", onUp);

    zr.on("touchstart", onDown);
    zr.on("touchmove", onMove);
    zr.on("touchend", onUp);

    return () => {
      zr.off("mousedown", onDown);
      zr.off("mousemove", onMove);
      zr.off("mouseup", onUp);
      zr.off("globalout", onUp);

      zr.off("touchstart", onDown);
      zr.off("touchmove", onMove);
      zr.off("touchend", onUp);
    };
  }, [chartReady, hasData]);

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

  const rangeChip = (() => {
    if (!rangeSummary) return null;

    const { delta, pctChange, startLabel, endLabel } = rangeSummary;

    const chipClass =
      "metric-card__delta-chip" +
      (delta > 0
        ? " metric-card__delta-chip--up"
        : delta < 0
        ? " metric-card__delta-chip--down"
        : "");

    const amountText = `${delta > 0 ? "+" : ""}${formatValueForDisplay(delta)}`;
    const pctText =
      pctChange != null && Number.isFinite(pctChange)
        ? `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%`
        : null;

    return (
      <span
        className={chipClass}
        style={{
          whiteSpace: "nowrap",
          marginLeft: 8,
          alignSelf: "flex-start",
          opacity: isDragging ? 1 : 0.95,
        }}
      >
        {amountText}
        {pctText ? ` (${pctText})` : ""}
        <span className="metric-card__delta-label"> {startLabel} → {endLabel}</span>
      </span>
    );
  })();

  return (
    <div className="chart-panel">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          className="chart-panel__title"
          style={{ marginBottom: 0, flex: "1 1 auto" }}
        >
          {title}
        </div>
        {rangeChip}
      </div>

      <ReactECharts
        ref={chartRef}
        onChartReady={() => setChartReady(true)}
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: 190 }}
      />
    </div>
  );
};
