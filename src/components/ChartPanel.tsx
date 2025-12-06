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
  const base = rawStep / Math.pow(10, exp);
  let niceBase: number;

  if (base < 1.5) niceBase = 1;
  else if (base < 3) niceBase = 2;
  else if (base < 7) niceBase = 5;
  else niceBase = 10;

  return niceBase * Math.pow(10, exp);
}

function formatRangeDelta(
  absValue: number,
  isPercentScale: boolean,
  tooltipValueFormatter?: (value: number) => string,
  valueFormatter?: (value: number) => string
): string {
  if (!Number.isFinite(absValue)) return "–";
  if (isPercentScale) return `${absValue.toFixed(2)}%`;
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
  const safeSeries = Array.isArray(series) ? series : [];

  const sorted = React.useMemo(
    () => [...safeSeries].sort((a, b) => a.date.localeCompare(b.date)),
    [safeSeries]
  );

  const x = React.useMemo(() => sorted.map((p) => p.date.slice(0, 7)), [sorted]);

  const y = React.useMemo(() => {
    return sorted.map((p) => {
      const v = p[valueKey] as number | null;
      return v == null ? NaN : v;
    });
  }, [sorted, valueKey]);

  const numeric = React.useMemo(
    () => y.filter((v) => typeof v === "number" && !Number.isNaN(v)) as number[],
    [y]
  );

  const hasData = sorted.length > 0 && numeric.length > 0;

  const isPercentScale =
    treatAsPercentScale ?? (valueKey === "mom_pct" || valueKey === "yoy_pct");

  // Theme vars (fallbacks if missing)
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

  // Chart + container refs
  const chartRef = React.useRef<any | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleChartReady = React.useCallback((instance: any) => {
    chartRef.current = instance;
  }, []);

  const safeCall = React.useCallback((fn: (inst: any) => void) => {
    const inst = chartRef.current;
    if (!inst) return;
    try {
      if (typeof inst.isDisposed === "function" && inst.isDisposed()) return;
      fn(inst);
    } catch {
      // swallow to avoid taking down the whole tab subtree
    }
  }, []);

  // Resize on tab visibility / dimension changes (common cause of blank charts)
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let ro: ResizeObserver | null = null;
    let raf: number | null = null;
    let tries = 0;

    const ensureSized = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        tries += 1;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          safeCall((inst) => inst.resize());
          tries = 0;
        } else if (tries < 30) {
          ensureSized();
        }
      });
    };

    ensureSized();

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => ensureSized());
      ro.observe(el);
    }

    const onAny = () => ensureSized();
    window.addEventListener("resize", onAny);
    document.addEventListener("visibilitychange", onAny);

    return () => {
      if (ro) ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onAny);
      document.removeEventListener("visibilitychange", onAny);
    };
  }, [safeCall]);

  // Drag state held in a ref (no React rerenders during drag)
  const dragRef = React.useRef<{ isDragging: boolean; startIndex: number | null }>({
    isDragging: false,
    startIndex: null,
  });

  // Reset any drag artifacts on data change
  React.useEffect(() => {
    dragRef.current = { isDragging: false, startIndex: null };

    safeCall((inst) => {
      try {
        inst.dispatchAction({ type: "hideTip" });
      } catch {
        // no-op
      }

      // Clear start line and pointer label
      inst.setOption(
        {
          tooltip: { axisPointer: { label: { show: false } } },
          series: [{ markLine: { data: [] } }],
        },
        { notMerge: false, lazyUpdate: true }
      );
    });
  }, [safeCall, safeSeries, valueKey]);

  // Attach ZRender events (mousedown/drag) safely
  React.useEffect(() => {
    if (!hasData || x.length === 0) return;

    let zr: any = null;
    safeCall((inst) => {
      zr = inst.getZr?.();
    });
    if (!zr) return;

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

      let idx: number | null = null;
      safeCall((inst) => {
        if (!inst.containPixel({ gridIndex: 0 }, [ox, oy])) return;
        const converted = inst.convertFromPixel({ gridIndex: 0 }, [ox, oy]);
        const xVal = Array.isArray(converted) ? converted[0] : converted;

        if (typeof xVal === "number" && Number.isFinite(xVal)) idx = Math.round(xVal);
        else if (typeof xVal === "string") {
          const found = x.indexOf(xVal);
          if (found >= 0) idx = found;
        }
      });

      if (idx == null) return null;
      return clampIndex(idx);
    };

    const showAxisPointerLabel = (show: boolean) => {
      safeCall((inst) => {
        inst.setOption(
          {
            tooltip: {
              axisPointer: {
                label: {
                  show,
                  formatter: (p: any) => (p?.value != null ? String(p.value) : ""),
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderWidth: 1,
                  color: theme.text,
                  padding: [6, 8],
                  borderRadius: 10,
                },
              },
            },
          },
          { notMerge: false, lazyUpdate: true }
        );
      });
    };

    // INSTANT start dotted line (no gradual draw)
    const applyStartLineInstant = (label: string) => {
      safeCall((inst) => {
        inst.setOption(
          {
            series: [
              {
                markLine: {
                  silent: true,
                  symbol: "none",
                  label: { show: false },
                  animation: false,
                  lineStyle: { type: "dotted", opacity: 0.65, width: 1 },
                  data: [{ xAxis: label }],
                },
              },
            ],
          },
          { notMerge: false, lazyUpdate: true }
        );
      });
    };

    const clearStartLineInstant = () => {
      safeCall((inst) => {
        inst.setOption(
          { series: [{ markLine: { data: [] } }] },
          { notMerge: false, lazyUpdate: true }
        );
      });
    };

    // rAF throttle showTip (prevents flicker)
    let tipRaf: number | null = null;
    let pendingTipIdx: number | null = null;
    let lastTipIdx = -1;

    const requestShowTip = (idx: number) => {
      if (idx === lastTipIdx) return;
      pendingTipIdx = idx;
      if (tipRaf != null) return;

      tipRaf = requestAnimationFrame(() => {
        tipRaf = null;
        if (pendingTipIdx == null) return;
        const next = pendingTipIdx;
        pendingTipIdx = null;
        lastTipIdx = next;

        safeCall((inst) => {
          inst.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: next });
        });
      });
    };

    const resetDrag = () => {
      dragRef.current = { isDragging: false, startIndex: null };

      safeCall((inst) => {
        try {
          inst.dispatchAction({ type: "hideTip" });
        } catch {
          // no-op
        }
      });

      showAxisPointerLabel(false);
      clearStartLineInstant();

      lastTipIdx = -1;
      pendingTipIdx = null;
      if (tipRaf != null) cancelAnimationFrame(tipRaf);
      tipRaf = null;
    };

    const onMouseDown = (e: any) => {
      const raw = getIndexFromEvent(e);
      if (raw == null) return;

      const snap = closestNumericIndex(raw);
      if (snap == null) return;

      dragRef.current = { isDragging: true, startIndex: snap };

      applyStartLineInstant(x[snap]); // instant start line
      showAxisPointerLabel(true);     // show date label only during drag
      requestShowTip(snap);
    };

    const onMouseMove = (e: any) => {
      const ds = dragRef.current;
      if (!ds.isDragging || ds.startIndex == null) return;

      const raw = getIndexFromEvent(e);
      if (raw == null) return;

      const snap = closestNumericIndex(raw);
      if (snap == null) return;

      requestShowTip(snap);
    };

    try {
      zr.on("mousedown", onMouseDown);
      zr.on("mousemove", onMouseMove);
      zr.on("mouseup", resetDrag);
      zr.on("globalout", resetDrag);
    } catch {
      // no-op
    }

    return () => {
      try {
        zr.off("mousedown", onMouseDown);
        zr.off("mousemove", onMouseMove);
        zr.off("mouseup", resetDrag);
        zr.off("globalout", resetDrag);
      } catch {
        // no-op
      }
      if (tipRaf != null) cancelAnimationFrame(tipRaf);
    };
  }, [hasData, x, y, safeCall, theme]);

  if (!hasData) {
    return (
      <div className="chart-panel chart-panel--empty" ref={containerRef}>
        <div className="chart-panel__title">{title}</div>
        <div className="chart-panel__empty-text">Not available for this selection.</div>
      </div>
    );
  }

  // Y-axis bounds
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

  const option: any = React.useMemo(() => {
    return {
      // Prevent “slow draw” of the line / markLine
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,

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
          label: { show: false }, // toggled imperatively during drag
        },

        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const axisValue = p && p.axisValue ? String(p.axisValue) : "";
          const idx: number | null =
            p && typeof p.dataIndex === "number" ? (p.dataIndex as number) : null;

          const val = p && typeof p.data === "number" ? (p.data as number) : NaN;
          if (!Number.isFinite(val) || Number.isNaN(val)) return axisValue;

          const ds = dragRef.current;
          const dragging = ds.isDragging && ds.startIndex != null && idx != null;

          // While dragging: don't repeat the current date line (date is shown by axisPointer label)
          const header = dragging ? "" : `${axisValue}<br/>`;

          const valueLine = `<div style="font-weight: 600;">${formatValue(val)}</div>`;
          if (!dragging) return `${header}${valueLine}`;

          const startIdx = ds.startIndex as number;
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

          // Directionally correct (current - start) => dragging backwards can be negative
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

          // Only color the delta text (no pill background)
          const color = change > 0 ? theme.success : change < 0 ? theme.danger : theme.text;

          const deltaLine = `
            <div style="margin-top: 6px; font-weight: 700; color: ${color};">
              ${sign}${deltaStr}${pctStr}
            </div>
          `;

          // Keep tooltip narrow by putting the dates below
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
          z: 2,

          // Start line is driven imperatively so it appears instantly.
          markLine: { data: [] },
        },
      ],
    };
  }, [
    x,
    y,
    theme,
    step,
    isPercentScale,
    valueAxisLabel,
    valueFormatter,
    tooltipValueFormatter,
    yMin,
    yMax,
    interval,
  ]);

  return (
    <div className="chart-panel" ref={containerRef}>
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
