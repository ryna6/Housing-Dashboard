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

// Format absolute delta value using existing formatters where possible.
function formatRangeDelta(
  absValue: number,
  isPercentScale: boolean,
  tooltipValueFormatter?: (value: number) => string,
  valueFormatter?: (value: number) => string
): string {
  if (!Number.isFinite(absValue)) return "–";

  if (isPercentScale) {
    return `${absValue.toFixed(2)}%`;
  }

  if (typeof tooltipValueFormatter === "function") return tooltipValueFormatter(absValue);
  if (typeof valueFormatter === "function") return valueFormatter(absValue);

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

  // Theme-aware tooltip styling (uses CSS vars if present; falls back gracefully)
  const theme = React.useMemo(() => {
    const fallback = {
      surface: "rgba(255,255,255,0.92)",
      border: "rgba(0,0,0,0.10)",
      text: "rgba(0,0,0,0.92)",
      danger: "#ef4444",
      success: "#22c55e",
      shadow: "0 10px 30px rgba(0,0,0,0.12)",
    };

    if (typeof window === "undefined") return fallback;

    const css = getComputedStyle(document.documentElement);
    const get = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;

    return {
      surface: get("--surface", fallback.surface),
      border: get("--border-subtle", fallback.border),
      text: get("--text", fallback.text),
      danger: get("--danger", fallback.danger),
      success: get("--success", get("--positive", fallback.success)),
      shadow: get("--shadow-soft", fallback.shadow),
    };
  }, []);

  // --- Google Finance-ish click/hold/drag anchor state ---
  const [chartInstance, setChartInstance] = React.useState<any | null>(null);
  const handleChartReady = React.useCallback((instance: any) => {
    setChartInstance(instance);
  }, []);

  // IMPORTANT: we do NOT update this on mousemove (prevents flicker).
  const [dragState, setDragState] = React.useState<{
    startIndex: number | null;
    isDragging: boolean;
  }>({ startIndex: null, isDragging: false });

  const dragRef = React.useRef(dragState);
  React.useEffect(() => {
    dragRef.current = dragState;
  }, [dragState]);

  // Reset drag when series/metric changes
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

    const clampIndex = (idx: number) => Math.max(0, Math.min(x.length - 1, idx));

    const closestNumericIndex = (idx: number): number | null => {
      if (idx < 0 || idx >= y.length) return null;
      if (isValidNumber(y[idx])) return idx;

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

      if (!inst.containPixel({ gridIndex: 0 }, [ox, oy])) return null;

      const converted = inst.convertFromPixel({ gridIndex: 0 }, [ox, oy]);
      const xVal = Array.isArray(converted) ? converted[0] : converted;

      let idx: number | null = null;
      if (typeof xVal === "number" && Number.isFinite(xVal)) idx = Math.round(xVal);
      else if (typeof xVal === "string") {
        const found = x.indexOf(xVal);
        if (found >= 0) idx = found;
      }

      if (idx == null) return null;
      return clampIndex(idx);
    };

    const hideTip = () => {
      try {
        inst.dispatchAction({ type: "hideTip" });
      } catch {
        // no-op
      }
    };

    // Throttle showTip to 1 per animation frame (prevents flicker)
    const lastTipIndexRef = { current: -1 as number };
    const pendingTipIndexRef = { current: null as null | number };
    const rafRef = { current: null as null | number };

    const requestShowTip = (idx: number) => {
      if (idx === lastTipIndexRef.current) return;
      pendingTipIndexRef.current = idx;

      if (rafRef.current != null) return;

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const next = pendingTipIndexRef.current;
        if (next == null) return;

        lastTipIndexRef.current = next;
        try {
          inst.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: next });
        } catch {
          // no-op
        }
      });
    };

    const onMouseDown = (e: any) => {
      const rawIdx = getIndexFromEvent(e);
      if (rawIdx == null) return;

      const snapIdx = closestNumericIndex(rawIdx);
      if (snapIdx == null) return;

      setDragState({ startIndex: snapIdx, isDragging: true });
      requestShowTip(snapIdx); // ensure the active cursor line appears immediately
    };

    const onMouseMove = (e: any) => {
      const ds = dragRef.current;
      if (!ds.isDragging || ds.startIndex == null) return;

      const rawIdx = getIndexFromEvent(e);
      if (rawIdx == null) return;

      const snapIdx = closestNumericIndex(rawIdx);
      if (snapIdx == null) return;

      requestShowTip(snapIdx);
    };

    const resetDrag = () => {
      setDragState({ startIndex: null, isDragging: false });
      hideTip();
      lastTipIndexRef.current = -1;
      pendingTipIndexRef.current = null;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    zr.on("mousedown", onMouseDown);
    zr.on("mousemove", onMouseMove);
    zr.on("mouseup", resetDrag);
    zr.on("globalout", resetDrag);

    return () => {
      zr.off("mousedown", onMouseDown);
      zr.off("mousemove", onMouseMove);
      zr.off("mouseup", resetDrag);
      zr.off("globalout", resetDrag);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [chartInstance, hasData, xKey]);

  if (!hasData) {
    return (
      <div className="chart-panel chart-panel--empty">
        <div className="chart-panel__title">{title}</div>
        <div className="chart-panel__empty-text">Not available for this selection.</div>
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

  const formatValue = (val: number): string => {
    if (isPercentScale) return `${val.toFixed(2)}%`;
    if (typeof tooltipValueFormatter === "function") return tooltipValueFormatter(val);
    if (typeof valueFormatter === "function") return valueFormatter(val);
    return val.toFixed(2);
  };

  // Persistent "start" dotted line while dragging
  const startLabel =
    dragState.isDragging && dragState.startIndex != null ? x[dragState.startIndex] : null;

  const option: any = {
    grid: { left: 40, right: 16, top: 8, bottom: 28 },

    tooltip: {
      trigger: "axis",
      triggerOn: "mousemove",
      showDelay: 0,
      hideDelay: 0,
      transitionDuration: 0,
      confine: true,
      appendToBody: true,
      renderMode: "html",

      // Theme-matching tooltip styling
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      textStyle: { color: theme.text, fontSize: 12 },
      padding: [10, 12],
      extraCssText: `border-radius: 14px; box-shadow: ${theme.shadow}; backdrop-filter: blur(8px);`,

      // Vertical dotted cursor line (no label => removes the empty bottom box)
      axisPointer: {
        type: "line",
        animation: false,
        lineStyle: { type: "dotted", opacity: 0.65, width: 1 },
        label: { show: false },
      },

      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const axisValue = p && p.axisValue ? String(p.axisValue) : "";
        const idx: number | null =
          p && typeof p.dataIndex === "number" ? (p.dataIndex as number) : null;

        const val = p && typeof p.data === "number" ? (p.data as number) : NaN;
        if (!Number.isFinite(val) || Number.isNaN(val)) return axisValue;

        const dragging = dragState.isDragging && dragState.startIndex != null && idx != null;

        // While dragging: do NOT show the "current date" header line
        const header = dragging ? "" : `${axisValue}<br/>`;

        const valueLine = `<div style="font-weight: 600;">${formatValue(val)}</div>`;

        if (!dragging) {
          return `${header}${valueLine}`;
        }

        const startIdx = dragState.startIndex as number;
        const curIdx = idx as number;

        const startVal = y[startIdx];
        const curVal = y[curIdx];

        if (
          typeof startVal !== "number" ||
          typeof curVal !== "number" ||
          !Number.isFinite(startVal) ||
          !Number.isFinite(curVal) ||
          Number.isNaN(startVal) ||
          Number.isNaN(curVal)
        ) {
          return `${valueLine}`;
        }

        // Directionally correct change: current - start (so dragging backwards can be negative)
        const change = curVal - startVal;
        const pctChange = startVal !== 0 ? (change / Math.abs(startVal)) * 100 : null;

        const sign = change > 0 ? "+" : change < 0 ? "-" : "";
        const deltaStr = formatRangeDelta(
          Math.abs(change),
          isPercentScale,
          tooltipValueFormatter,
          valueFormatter
        );

        let pctStr = "";
        if (pctChange != null && Number.isFinite(pctChange)) {
          const pctSign = pctChange > 0 ? "+" : pctChange < 0 ? "-" : "";
          pctStr = ` (${pctSign}${Math.abs(pctChange).toFixed(1)}%)`;
        }

        // Only color the delta text (no pill)
        const color = change > 0 ? theme.success : change < 0 ? theme.danger : theme.text;

        const deltaLine = `
          <div style="margin-top: 6px; font-weight: 600; color: ${color};">
            ${sign}${deltaStr}${pctStr}
          </div>
        `;

        // Dates under delta (narrower tooltip)
        const rangeLine = `
          <div style="margin-top: 4px; opacity: 0.75; font-size: 11px;">
            ${x[startIdx]} → ${x[curIdx]}
          </div>
        `;

        return `${valueLine}${deltaLine}${rangeLine}`;
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

        // Persistent start vertical dotted line while dragging
        markLine: startLabel
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { type: "dotted", opacity: 0.65, width: 1 },
              data: [{ xAxis: startLabel }],
            }
          : undefined,
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
