import React, { useMemo, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import type { PanelPoint } from "../data/types";

type ValueKey = "value" | "mom_pct" | "yoy_pct";

type SelectionMode = "idle" | "dragging" | "selected";

interface Props {
  title: string;
  series: PanelPoint[];
  valueKey: ValueKey;
  /**
   * If true, the value is on a 0–100 scale and should be formatted with a % sign.
   */
  treatAsPercentScale?: boolean;
  /**
   * Optional formatter for numeric values on the Y-axis ticks
   * when not using percent scale.
   */
  valueAxisLabel?: string;
  valueAxisFormatter?: (value: number) => string;
  /**
   * Optional formatter for tooltip values. If omitted, the value axis formatter
   * (or default formatter) will be reused.
   */
  tooltipValueFormatter?: (value: number | null | undefined) => string;
  /**
   * If true, force the Y-axis minimum to zero for positive-only series.
   */
  clampYMinToZero?: boolean;
  /**
   * Optional explicit Y-axis bounds.
   */
  minY?: number;
  maxY?: number;
}

interface RangeInfo {
  startIndex: number;
  endIndex: number;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  absoluteChange: number;
  percentChange: number | null;
}

/**
 * Helper to format numbers consistently.
 */
function makeDefaultFormatter(treatAsPercentScale?: boolean) {
  if (treatAsPercentScale) {
    return (value: number) => `${value.toFixed(1)}%`;
  }
  return (value: number) =>
    value.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

/**
 * Helper to format the change as "+X / +Y%" or "-X / -Y%".
 */
function formatDeltaValue(
  info: RangeInfo,
  formatter: (value: number) => string,
): string {
  const { absoluteChange, percentChange } = info;
  const sign = absoluteChange >= 0 ? "+" : "−"; // use minus symbol for negatives
  const absChange = Math.abs(absoluteChange);

  const formattedChange = formatter(absChange);
  if (percentChange == null) {
    return `${sign}${formattedChange}`;
  }

  const absPct = Math.abs(percentChange).toFixed(1);
  return `${sign}${formattedChange} (${sign}${absPct}%)`;
}

/**
 * Compute the range statistics given a start and end index in the series.
 */
function computeRangeInfo(
  series: PanelPoint[],
  valueKey: ValueKey,
  startIndex: number,
  endIndex: number,
): RangeInfo | null {
  if (!series.length) return null;

  const s = Math.max(0, Math.min(startIndex, endIndex));
  const e = Math.min(series.length - 1, Math.max(startIndex, endIndex));
  if (s === e) return null;

  const start = series[s];
  const end = series[e];

  const startRaw = start[valueKey] as number | null | undefined;
  const endRaw = end[valueKey] as number | null | undefined;

  if (startRaw == null || endRaw == null || !isFinite(startRaw) || !isFinite(endRaw)) {
    return null;
  }

  const absoluteChange = endRaw - startRaw;
  const percentChange =
    startRaw !== 0 ? (absoluteChange / Math.abs(startRaw)) * 100 : null;

  return {
    startIndex: s,
    endIndex: e,
    startDate: start.date,
    endDate: end.date,
    startValue: startRaw,
    endValue: endRaw,
    absoluteChange,
    percentChange,
  };
}

/**
 * Small utility to build className strings.
 */
function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  treatAsPercentScale,
  valueAxisFormatter,
  tooltipValueFormatter,
  clampYMinToZero,
  minY,
  maxY,
}) => {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("idle");
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [rangeInfo, setRangeInfo] = useState<RangeInfo | null>(null);

  // Sort by date, but defensively handle non-array or undefined series at runtime.
  const sorted = useMemo(() => {
    const baseSeries = Array.isArray(series) ? series : [];
    return [...baseSeries].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }, [series]);

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
    valueAxisFormatter ?? makeDefaultFormatter(treatAsPercentScale);
  const tooltipFormatter =
    tooltipValueFormatter ?? axisFormatter;

  const [yMin, yMax] = useMemo<[number, number]>(() => {
    const valid = rawValues.filter((v) => Number.isFinite(v)) as number[];
    if (!valid.length) return [0, 1];

    let localMin = Math.min(...valid);
    let localMax = Math.max(...valid);

    if (clampYMinToZero && localMin > 0) {
      localMin = 0;
    }

    if (minY != null) localMin = minY;
    if (maxY != null) localMax = maxY;

    if (localMax === localMin) {
      const pad = Math.abs(localMin || 1) * 0.1;
      return [localMin - pad, localMax + pad];
    }

    return [localMin, localMax];
  }, [rawValues, clampYMinToZero, minY, maxY]);

  const handleMouseDown = useCallback(
    (params: any) => {
      // Only respond to clicks on valid data points
      if (!params || typeof params.dataIndex !== "number") return;
      if (!Number.isFinite(rawValues[params.dataIndex])) return;

      setSelectionMode("dragging");
      setDragStartIndex(params.dataIndex);
      setRangeInfo(null);
    },
    [rawValues],
  );

  const handleMouseUp = useCallback(
    (params: any) => {
      if (selectionMode !== "dragging" || dragStartIndex == null) {
        return;
      }
      if (!params || typeof params.dataIndex !== "number") {
        setSelectionMode("idle");
        setDragStartIndex(null);
        return;
      }

      const endIndex = params.dataIndex;
      const info = computeRangeInfo(sorted, valueKey, dragStartIndex, endIndex);

      if (!info) {
        setSelectionMode("idle");
        setDragStartIndex(null);
        setRangeInfo(null);
        return;
      }

      setSelectionMode("selected");
      setDragStartIndex(null);
      setRangeInfo(info);
    },
    [selectionMode, dragStartIndex, sorted, valueKey],
  );

  const handleMouseLeave = useCallback(() => {
    if (selectionMode === "dragging") {
      setSelectionMode("idle");
      setDragStartIndex(null);
      setRangeInfo(null);
    }
  }, [selectionMode]);

  const option = useMemo(
    () => ({
      grid: {
        left: 56,
        right: 24,
        top: 32,
        bottom: 40,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },
        valueFormatter: (val: number | null | undefined) => {
          if (val == null || !isFinite(val)) return "N/A";
          return tooltipFormatter(val);
        },
      },
      xAxis: {
        type: "category",
        data: xData,
        axisLabel: {
          formatter: (value: string) => value.slice(0, 7), // YYYY-MM
        },
      },
      yAxis: {
        type: "value",
        min: yMin,
        max: yMax,
        axisLabel: {
          formatter: (value: number) => {
            if (!isFinite(value)) return "";
            return axisFormatter(value);
          },
        },
      },
      dataZoom: [
        {
          type: "inside",
          throttle: 50,
        },
        {
          type: "slider",
          height: 18,
          bottom: 8,
        },
      ],
      series: [
        {
          type: "line",
          data: rawValues,
          showSymbol: false,
          smooth: false,
          lineStyle: {
            width: 2,
          },
          areaStyle: {
            opacity: 0.05,
          },
        },
      ],
    }),
    [xData, rawValues, yMin, yMax, axisFormatter, tooltipFormatter],
  );

  return (
    <div
      className={classNames(
        "chart-panel",
        selectionMode === "dragging" && "chart-panel--dragging",
        selectionMode === "selected" && "chart-panel--selected",
      )}
      onMouseLeave={handleMouseLeave}
    >
      <div className="chart-panel__header">
        <h3 className="chart-panel__title">{title}</h3>
        <div className="chart-panel__meta">
          {selectionMode === "selected" && rangeInfo ? (
            <div className="chart-panel__selection-summary">
              <div className="chart-panel__selection-dates">
                {rangeInfo.startDate.slice(0, 10)} →{" "}
                {rangeInfo.endDate.slice(0, 10)}
              </div>
              <div
                className={classNames(
                  "chart-panel__selection-change",
                  rangeInfo.absoluteChange > 0 &&
                    "chart-panel__selection-change--positive",
                  rangeInfo.absoluteChange < 0 &&
                    "chart-panel__selection-change--negative",
                )}
              >
                {formatDeltaValue(rangeInfo, axisFormatter)}
              </div>
            </div>
          ) : (
            <div className="chart-panel__hint">
              Click and drag on the chart to measure a period.
            </div>
          )}
        </div>
      </div>

      <div className="chart-panel__body">
        <ReactECharts
          option={option}
          notMerge
          lazyUpdate
          onEvents={{
            mousedown: handleMouseDown,
            mouseup: handleMouseUp,
          }}
          style={{ width: "100%", height: "280px" }}
        />
      </div>
    </div>
  );
};
