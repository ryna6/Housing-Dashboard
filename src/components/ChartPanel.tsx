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

function parseRgbLike(color: string): { r: number; g: number; b: number } | null {
  const c = color.trim();

  // rgb()/rgba()
  const rgbMatch = c.match(
    /^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})(?:\s*[,/]\s*([0-9.]+))?\s*\)$/
  );
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
    return { r, g, b };
  }

  // #RGB or #RRGGBB
  const hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  return null;
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

  // Theme-aware styling (CSS vars if present; fallbacks if not)
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

  // Gradient for "under the curve" selection area:
  // darker near the line (top), fading to transparent near the bottom.
  const selectionAreaGradient = React.useMemo(() => {
    const rgb = parseRgbLike(theme.text);
    let isDarkTheme = false;

    if (rgb) {
      // If text is light => background likely dark.
      const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      isDarkTheme = lum > 0.6;
    }

    const top = isDarkTheme ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
    const mid = isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
    const bottom = "rgba(0,0,0,0.0)";

    // ECharts supports gradient objects without importing echarts.graphic
    return {
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: top },     // near the line
        { offset: 0.55, color: mid },  // mid fade
        { offset: 1, color: bottom },  // fade into background
      ],
    };
  }, [theme.text]);

  // --- Click/hold/drag anchor state ---
  const [chartInstance, setChartInstance] = React.useState<any | null>(null);
  const handleChartReady = React.useCallback((instance: any) => {
    setChartInstance(instance);
  }, []);

  // NOTE: do NOT update this on mousemove (prevents tooltip flicker)
  const [dragState, setDragState] = React.useState<{
    startIndex: number | null;
    isDragging: boolean;
  }>({ startIndex: null, isDragging: false });

  const dragRef = React.useRef(dragState);
  React.useEffect(() => {
    dragRef.current = dragState;
  }, [dragState]);

  // Reset on data/metric change
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

    // rAF throttling for both showTip and selection overlay updates
    const lastTipIndexRef = { current: -1 as number };
    const pendingTipIndexRef = { current: null as null | number };
    const tipRafRef = { current: null as null | number };

    const lastOverlayKeyRef = { current: "" as string };
    const pendingOverlayRef = { current: null as null | { a: number; b: number } };
    const overlayRafRef = { current: null as null | number };

    const requestShowTip = (idx: number) => {
      if (idx === lastTipIndexRef.current) return;
      pendingTipIndexRef.current = idx;

      if (tipRafRef.current != null) return;

      tipRafRef.current = window.requestAnimationFrame(() => {
        tipRafRef.current = null;
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

    const clearUnderCurveOverlay = () => {
      // Clear overlay series (seriesIndex: 1)
      inst.setOption(
        {
          series: [
            {},
            {
              data: new Array(y.length).fill(null),
            },
          ],
        },
        { notMerge: false, lazyUpdate: true }
      );
      lastOverlayKeyRef.current = "";
      pendingOverlayRef.current = null;
    };

    const applyUnderCurveOverlay = (a: number, b: number) => {
      const overlay = new Array(y.length).fill(null);
      for (let i = a; i <= b; i += 1) {
        const v = y[i];
        overlay[i] = Number.isFinite(v) && !Number.isNaN(v) ? v : null;
      }

      inst.setOption(
        {
          series: [
            {},
            {
              data: overlay,
            },
          ],
        },
        { notMerge: false, lazyUpdate: true }
      );
    };

    const requestUnderCurveOverlay = (startIdx: number, curIdx: number) => {
      const a = Math.min(startIdx, curIdx);
      const b = Math.max(startIdx, curIdx);

      if (a === b) {
        clearUnderCurveOverlay();
        return;
      }

      const key = `${a}-${b}`;
      if (key === lastOverlayKeyRef.current) return;

      pendingOverlayRef.current = { a, b };
      if (overlayRafRef.current != null) return;

      overlayRafRef.current = window.requestAnimationFrame(() => {
        overlayRafRef.current = null;
        const pending = pendingOverlayRef.current;
        if (!pending) return;

        const k = `${pending.a}-${pending.b}`;
        if (k === lastOverlayKeyRef.current) return;

        lastOverlayKeyRef.current = k;
        applyUnderCurveOverlay(pending.a, pending.b);
      });
    };

    const onMouseDown = (e: any) => {
      const rawIdx = getIndexFromEvent(e);
      if (rawIdx == null) return;

      const snapIdx = closestNumericIndex(rawIdx);
      if (snapIdx == null) return;

      setDragState({ startIndex: snapIdx, isDragging: true });
      requestShowTip(snapIdx);
      clearUnderCurveOverlay(); // set once we move to a second point
    };

    const onMouseMove = (e: any) => {
      const ds = dragRef.current;
      if (!ds.isDragging || ds.startIndex == null) return;

      const rawIdx = getIndexFromEvent(e);
      if (rawIdx == null) return;

      const snapIdx = closestNumericIndex(rawIdx);
      if (snapIdx == null) return;

      requestShowTip(snapIdx);
      requestUnderCurveOverlay(ds.startIndex, snapIdx);
    };

    const resetDrag = () => {
      setDragState({ startIndex: null, isDragging: false });
      hideTip();
      clearUnderCurveOverlay();

      lastTipIndexRef.current = -1;
      pendingTipIndexRef.current = null;

      if (tipRafRef.current != null) {
        window.cancelAnimationFrame(tipRafRef.current);
        tipRafRef.current = null;
      }
      if (overlayRafRef.current != null) {
        window.cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
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

      if (tipRafRef.current != null) window.cancelAnimationFrame(tipRafRef.current);
      if (overlayRafRef.current != null) window.cancelAnimationFrame(overlayRafRef.current);
    };
  }, [chartInstance, hasData, xKey, selectionAreaGradient]);

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

      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      textStyle: { color: theme.text, fontSize: 12 },
      padding: [10, 12],
      extraCssText: `border-radius: 14px; box-shadow: ${theme.shadow}; backdrop-filter: blur(8px);`,

      axisPointer: {
        type: "line",
        animation: false,
        lineStyle: { type: "dotted", opacity: 0.65, width: 1 },
        // Only show axisPointer label during drag (no empty bottom box on hover)
        label: dragState.isDragging
          ? {
              show: true,
              formatter: (p: any) => (p?.value != null ? String(p.value) : ""),
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
              color: theme.text,
              padding: [6, 8],
              borderRadius: 10,
            }
          : { show: false },
      },

      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const axisValue = p && p.axisValue ? String(p.axisValue) : "";
        const idx: number | null =
          p && typeof p.dataIndex === "number" ? (p.dataIndex as number) : null;

        const val = p && typeof p.data === "number" ? (p.data as number) : NaN;
        if (!Number.isFinite(val) || Number.isNaN(val)) return axisValue;

        const dragging = dragState.isDragging && dragState.startIndex != null && idx != null;

        // While dragging: don't repeat the date header line (date is in axisPointer label)
        const header = dragging ? "" : `${axisValue}<br/>`;
        const valueLine = `<div style="font-weight: 600;">${formatValue(val)}</div>`;

        if (!dragging) return `${header}${valueLine}`;

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

        const color = change > 0 ? theme.success : change < 0 ? theme.danger : theme.text;

        const deltaLine = `
          <div style="margin-top: 6px; font-weight: 700; color: ${color};">
            ${sign}${deltaStr}${pctStr}
          </div>
        `;

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
      // Main line series (unchanged behavior)
      {
        type: "line",
        data: y,
        showSymbol: false,
        connectNulls: true,
        smooth: !step,
        step: step ? "end" : undefined,
        z: 3,

        // persistent start vertical dotted line during drag
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

      // Under-curve selection overlay series (data is driven imperatively during drag)
      {
        type: "line",
        data: new Array(y.length).fill(null),
        showSymbol: false,
        connectNulls: false,
        smooth: !step,
        step: step ? "end" : undefined,
        silent: true,
        z: 2,

        lineStyle: { opacity: 0 },
        emphasis: { disabled: true },
        tooltip: { show: false },

        areaStyle: {
          opacity: 1,
          origin: "start",
          color: selectionAreaGradient,
        },
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
