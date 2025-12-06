import React from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: "value" | "mom_pct" | "yoy_pct";
  valueAxisLabel?: string;
  valueFormatter?: (value: number) => string;
  tooltipValueFormatter?: (value: number) => string;
  step?: boolean;
  treatAsPercentScale?: boolean;
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

// Helper to format the change value for range selection.
// Reuses existing formatters where possible.
function formatRangeDelta(
  absValue: number,
  isPercentScale: boolean,
  tooltipValueFormatter?: (value: number) => string,
  valueFormatter?: (value: number) => string
): string {
  if (!Number.isFinite(absValue)) return "–";

  // If the chart is on a percent scale already (e.g. MoM / YoY),
  // treat this as percentage points.
  if (isPercentScale) {
    return `${absValue.toFixed(2)}%`;
  }

  if (typeof tooltipValueFormatter === "function") {
    return tooltipValueFormatter(absValue);
  }

  if (typeof valueFormatter === "function") {
    return valueFormatter(absValue);
  }

  return absValue.toFixed(2);
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

  // --- Google Finance–style click/hold/drag anchor state (resets on mouseup) ---
  const [chartInstance, setChartInstance] = React.useState<any | null>(null);

  const handleChartReady = React.useCallback((instance: any) => {
    setChartInstance(instance);
  }, []);

  const [dragState, setDragState] = React.useState<{
    startIndex: number | null;
    isDragging: boolean;
  }>({
    startIndex: null,
    isDragging: false,
  });

  // Reset selection when chart data/metric changes
  React.useEffect(() => {
    setDragState({ startIndex: null, isDragging: false });
  }, [series, valueKey]);

  const xKey = x.join("|");

  React.useEffect(() => {
    const inst = chartInstance;
    if (!inst || !hasData || x.length === 0) return;

    const zr = inst.getZr();

    const isValidNumber = (v: any): v is number =>
      typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

    const closestNumericIndex = (idx: number): number | null => {
      if (idx < 0 || idx >= y.length) return null;
      if (isValidNumber(y[idx])) return idx;

      // search outward for the closest numeric point
      for (let d = 1; d < y.length; d += 1) {
        const left = idx - d;
        const right = idx + d;
        if (left >= 0 && isValidNumber(y[left])) return left;
        if (right < y.length && isValidNumber(y[right])) return right;
      }
      return null;
    };

    const getIndexFromEvent = (e: any): number | null => {
      const ox = e?.offsetX;
      const oy = e?.offsetY;
      if (typeof ox !== "number" || typeof oy !== "number") return null;

      // Only react to drags inside the main plot area
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
      const rawIdx = getIndexFromEvent(e);
      if (rawIdx == null) return;

      const snapIdx = closestNumericIndex(rawIdx);
      if (snapIdx == null) return;

      setDragState({ startIndex: snapIdx, isDragging: true });
    };

    const resetDrag = () => {
      // requirement (1): reset immediately when mouse lets go
      setDragState({ startIndex: null, isDragging: false });
    };

    zr.on("mousedown", onMouseDown);
    zr.on("mouseup", resetDrag);
    zr.on("globalout", resetDrag);

    return () => {
      zr.off("mousedown", onMouseDown);
      zr.off("mouseup", resetDrag);
      zr.off("globalout", resetDrag);
    };
  }, [chartInstance, hasData, xKey]);

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
    const base = Math.abs(rawMin) || 1;
    const rough = base / 3;
    const stepSize = niceStep(rough);
    interval = stepSize;

    let min = rawMin - stepSize;
    let max = rawMax + stepSize;

    if (clampYMinToZero) min = Math.max(0, min);

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

    let min = niceMin - stepSize;
    let max = niceMax + stepSize;

    if (clampYMinToZero) min = Math.max(0, min);

    yMin = min;
    yMax = max;
  }

  // tooltip format helper (keeps your existing formatting behavior)
  const formatValue = (val: number): string => {
    if (isPercentScale) return `${val.toFixed(2)}%`;
    if (typeof tooltipValueFormatter === "function") return tooltipValueFormatter(val);
    if (typeof valueFormatter === "function") return valueFormatter(val);
    return val.toFixed(2);
  };

  const option: any = {
    grid: { left: 40, right: 16, top: 8, bottom: 28 },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const axisValue = p && p.axisValue ? String(p.axisValue) : "";
        const idx: number | null =
          p && typeof p.dataIndex === "number" ? (p.dataIndex as number) : null;

        const val =
          p && typeof p.data === "number" ? (p.data as number) : NaN;

        // Base tooltip (unchanged)
        if (!Number.isFinite(val) || Number.isNaN(val)) {
          return axisValue;
        }

        const baseLine = `${axisValue}<br/>${formatValue(val)}`;

        // requirement (2): show range change in the same tooltip, not above chart
        // requirement (1): only show while dragging (we reset on mouseup)
        if (!dragState.isDragging || dragState.startIndex == null || idx == null) {
          return baseLine;
        }

        // Snap current and start indices to numeric points if needed
        const isValidNumber = (v: any): v is number =>
          typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

        const closestNumericIndex = (index: number): number | null => {
          if (index < 0 || index >= y.length) return null;
          if (isValidNumber(y[index])) return index;
          for (let d = 1; d < y.length; d += 1) {
            const left = index - d;
            const right = index + d;
            if (left >= 0 && isValidNumber(y[left])) return left;
            if (right < y.length && isValidNumber(y[right])) return right;
          }
          return null;
        };

        const startIdx = closestNumericIndex(dragState.startIndex);
        const curIdx = closestNumericIndex(idx);

        if (startIdx == null || curIdx == null || startIdx === curIdx) {
          return baseLine;
        }

        const startVal = y[startIdx];
        const curVal = y[curIdx];
        if (!isValidNumber(startVal) || !isValidNumber(curVal)) {
          return baseLine;
        }

        // requirement (3): directionally correct change (current - anchor),
        // so dragging backwards can be negative
        const absChange = curVal - startVal;
        const pctChange =
          startVal !== 0 ? (absChange / Math.abs(startVal)) * 100 : null;

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

        let pctStr = "";
        if (pctChange != null && Number.isFinite(pctChange)) {
          const pctSign = pctChange > 0 ? "+" : pctChange < 0 ? "-" : "";
          pctStr = ` (${pctSign}${Math.abs(pctChange).toFixed(1)}%)`;
        }

        const startLabel = x[startIdx];
        const curLabel = x[curIdx];

        const deltaHtml = `<span class="${chipClass}">${sign}${deltaStr}${pctStr}<span class="metric-card__delta-label"> ${startLabel} → ${curLabel}</span></span>`;

        return `${baseLine}<br/>${deltaHtml}`;
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
          if (isPercentScale) return `${val.toFixed(0)}%`;
          if (typeof valueFormatter === "function") return valueFormatter(val);
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
