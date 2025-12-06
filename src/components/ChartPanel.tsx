import React from "react";
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

// Helper to format the change value for our Google Finance–style range selection.
// Reuses existing formatters where possible.
function formatRangeDelta(
  value: number,
  isPercentScale: boolean,
  tooltipValueFormatter?: (value: number) => string,
  valueFormatter?: (value: number) => string
): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);

  // If the chart is on a percent scale already (e.g. MoM / YoY),
  // treat this as percentage points.
  if (isPercentScale) {
    return `${abs.toFixed(2)}%`;
  }

  // Prefer tooltip formatter (usually richest formatting)
  if (typeof tooltipValueFormatter === "function") {
    return tooltipValueFormatter(abs);
  }

  // Fallback to axis formatter
  if (typeof valueFormatter === "function") {
    return valueFormatter(abs);
  }

  return abs.toFixed(2);
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

  // --- Google Finance–style click-and-drag range selection ---

  const [chartInstance, setChartInstance] = React.useState<any | null>(null);

  const handleChartReady = React.useCallback((instance: any) => {
    setChartInstance(instance);
  }, []);

  const [dragState, setDragState] = React.useState<{
    startIndex: number | null;
    currentIndex: number | null;
    isDragging: boolean;
  }>({
    startIndex: null,
    currentIndex: null,
    isDragging: false,
  });

  // Reset selection when the underlying series / metric changes
  React.useEffect(() => {
    setDragState({
      startIndex: null,
      currentIndex: null,
      isDragging: false,
    });
  }, [series, valueKey]);

  // Normalize selection to [startIndex, endIndex] with start <= end
  const rangeSelection = React.useMemo(() => {
    if (
      dragState.startIndex == null ||
      dragState.currentIndex == null ||
      dragState.startIndex === dragState.currentIndex
    ) {
      return null;
    }

    const start = Math.min(dragState.startIndex, dragState.currentIndex);
    const end = Math.max(dragState.startIndex, dragState.currentIndex);

    if (start < 0 || end >= y.length) return null;
    return { startIndex: start, endIndex: end };
  }, [dragState, y.length]);

  // Compute change over the selected range (absolute + %).
  // If either endpoint is NaN, we snap inward to the nearest numeric value.
  const rangeStats = React.useMemo(() => {
    if (!rangeSelection) return null;

    const { startIndex, endIndex } = rangeSelection;

    const findForward = (from: number, to: number) => {
      for (let i = from; i <= to; i += 1) {
        const v = y[i];
        if (typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v)) {
          return { index: i, value: v };
        }
      }
      return null;
    };

    const findBackward = (from: number, to: number) => {
      for (let i = from; i >= to; i -= 1) {
        const v = y[i];
        if (typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v)) {
          return { index: i, value: v };
        }
      }
      return null;
    };

    const startPoint = findForward(startIndex, endIndex);
    const endPoint = findBackward(endIndex, startIndex);
    if (!startPoint || !endPoint) return null;

    const absChange = endPoint.value - startPoint.value;
    const pctChange =
      startPoint.value !== 0
        ? (absChange / Math.abs(startPoint.value)) * 100
        : null;

    return {
      absChange,
      pctChange,
      startLabel: x[startPoint.index],
      endLabel: x[endPoint.index],
    };
  }, [rangeSelection, x, y]);

  // Attach ZRender (canvas) events so dragging works anywhere on the plot area,
  // not just directly over the line.
  const xKey = x.join("|");
  React.useEffect(() => {
    const inst = chartInstance;
    if (!inst || !hasData || x.length === 0) return;

    const zr = inst.getZr();

    const getIndexFromEvent = (e: any): number | null => {
      const ox = e?.offsetX;
      const oy = e?.offsetY;
      if (typeof ox !== "number" || typeof oy !== "number") return null;

      // Only react to drags inside the main grid plot area
      if (!inst.containPixel({ gridIndex: 0 }, [ox, oy])) return null;

      const converted = inst.convertFromPixel({ gridIndex: 0 }, [ox, oy]);
      const xVal = Array.isArray(converted) ? converted[0] : converted;

      let idx: number | null = null;
      if (typeof xVal === "number" && Number.isFinite(xVal)) {
        idx = Math.round(xVal);
      } else if (typeof xVal === "string") {
        const found = x.indexOf(xVal);
        if (found >= 0) idx = found;
      }

      if (idx == null) return null;
      idx = Math.max(0, Math.min(x.length - 1, idx));
      return idx;
    };

    const onMouseDown = (e: any) => {
      const idx = getIndexFromEvent(e);
      if (idx == null) return;

      setDragState({
        startIndex: idx,
        currentIndex: idx,
        isDragging: true,
      });
    };

    const onMouseMove = (e: any) => {
      const idx = getIndexFromEvent(e);
      if (idx == null) return;

      setDragState((prev) => {
        if (!prev.isDragging || prev.startIndex == null) return prev;
        if (idx === prev.currentIndex) return prev;
        return { ...prev, currentIndex: idx };
      });
    };

    const onMouseUp = () => {
      setDragState((prev) => {
        if (!prev.isDragging) return prev;
        return { ...prev, isDragging: false };
      });
    };

    zr.on("mousedown", onMouseDown);
    zr.on("mousemove", onMouseMove);
    zr.on("mouseup", onMouseUp);
    zr.on("globalout", onMouseUp);

    return () => {
      zr.off("mousedown", onMouseDown);
      zr.off("mousemove", onMouseMove);
      zr.off("mouseup", onMouseUp);
      zr.off("globalout", onMouseUp);
    };
  }, [chartInstance, hasData, xKey]);

  // Build the chip row under the chart title (reuses MoM/YoY card styles)
  let rangeSummaryNode: React.ReactNode = null;
  if (rangeStats && hasData) {
    const { absChange, pctChange, startLabel, endLabel } = rangeStats;

    const chipClass =
      "metric-card__delta-chip" +
      (absChange > 0
        ? " metric-card__delta-chip--up"
        : absChange < 0
        ? " metric-card__delta-chip--down"
        : "");

    const sign = absChange > 0 ? "+" : absChange < 0 ? "-" : "";
    const deltaStr = formatRangeDelta(
      Math.abs(absChange),
      isPercentScale,
      tooltipValueFormatter,
      valueFormatter
    );

    let pctStr: string | null = null;
    if (pctChange != null && Number.isFinite(pctChange)) {
      const pctSign = pctChange > 0 ? "+" : pctChange < 0 ? "-" : "";
      pctStr = `${pctSign}${Math.abs(pctChange).toFixed(1)}%`;
    }

    rangeSummaryNode = (
      <div className="metric-card__delta-row">
        <span className={chipClass}>
          {sign}
          {deltaStr}
          {pctStr && (
            <>
              {" ("}
              {pctStr}
              {")"}
            </>
          )}
          <span className="metric-card__delta-label">
            {" "}
            {startLabel} → {endLabel}
          </span>
        </span>
      </div>
    );
  }

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
      <div className="chart-panel__title">{title}</div>
      {rangeSummaryNode}
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        onChartReady={handleChartReady}
        style={{ width: "100%", height: 190 }}
      />
    </div>
  );
};
