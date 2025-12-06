import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { PanelPoint } from "../data/types";

type ValueKey = "value" | "mom_pct" | "yoy_pct";

interface Props {
  /** Card title */
  title: string;
  /** Time-series data for a single metric / region / segment */
  series: PanelPoint[];
  /** Which numeric field from PanelPoint should be plotted */
  valueKey: ValueKey;
  /**
   * Optional label for the Y axis (e.g. "Index", "Billions of dollars").
   * If omitted, the axis will be unlabeled.
   */
  valueAxisLabel?: string;
  /**
   * Optional formatter for numeric values on the Y-axis ticks when not using
   * percent scale. Kept for backwards compatibility with the old component.
   */
  valueFormatter?: (value: number) => string;
  /**
   * Optional, more explicit axis formatter name. If both valueAxisFormatter and
   * valueFormatter are provided, valueAxisFormatter wins.
   */
  valueAxisFormatter?: (value: number) => string;
  /**
   * Optional formatter for numeric values inside the tooltip.
   * If not provided, we’ll format based on treatAsPercentScale.
   */
  tooltipValueFormatter?: (value: number) => string;
  /**
   * When true, interpret values as percentages and use a percent-style
   * Y-axis and tooltip.
   */
  treatAsPercentScale?: boolean;
  /**
   * When true, clamp the Y-axis minimum at (or just below) zero so charts
   * that should not go negative are easier to read.
   */
  clampYMinToZero?: boolean;
  /**
   * Optional hint to draw the line as a step function (useful for policy rates).
   */
  step?: boolean;
}

/** Default formatter for non-percent values (e.g. prices, volumes). */
const defaultValueFormatter = (value: number): string =>
  value.toLocaleString("en-CA", { maximumFractionDigits: 0 });

/** Default formatter for percent values. */
const defaultPercentFormatter = (value: number): string =>
  `${value.toFixed(1)}%`;

/** Convert a YYYY-MM-DD (or YYYY-MM-01) date into a nice tick label. */
function formatIsoMonthLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

/** Safely extract a numeric value from a PanelPoint by key. */
function getNumericValue(point: PanelPoint, key: ValueKey): number | null {
  const raw = (point as any)[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : null;
}

interface SelectionSummary {
  startIndex: number;
  endIndex: number;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  absChange: number;
  pctChange: number | null;
}

const ChartPanel: React.FC<Props> = ({
  title,
  series,
  valueKey,
  valueAxisLabel,
  valueFormatter,
  valueAxisFormatter,
  tooltipValueFormatter,
  treatAsPercentScale,
  clampYMinToZero,
  step,
}) => {
  // Sort data by date ascending to ensure consistent behaviour.
  const sortedSeries = useMemo(
    () =>
      [...series].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [series],
  );

  // Range measurement state: click once to set a start, click again to set end.
  const [pendingStartIndex, setPendingStartIndex] = useState<number | null>(
    null,
  );
  const [selection, setSelection] = useState<SelectionSummary | null>(null);

  // Axis formatting – prefer explicit axis formatter, then old valueFormatter,
  // then sensible defaults based on whether we’re in percent mode.
  const axisFormat = useMemo(
    () =>
      valueAxisFormatter ??
      valueFormatter ??
      ((v: number) =>
        treatAsPercentScale ? defaultPercentFormatter(v) : defaultValueFormatter(v)),
    [valueAxisFormatter, valueFormatter, treatAsPercentScale],
  );

  // Tooltip formatter that can gracefully handle null / undefined values.
  const tooltipFormat = useMemo(
    () =>
      (value: number | null | undefined): string => {
        if (value === null || value === undefined) return "N/A";
        if (tooltipValueFormatter) return tooltipValueFormatter(value);
        return treatAsPercentScale
          ? defaultPercentFormatter(value)
          : defaultValueFormatter(value);
      },
    [tooltipValueFormatter, treatAsPercentScale],
  );

  const xRawDates = sortedSeries.map((p) => p.date);
  const xCategories = xRawDates.map((d) => formatIsoMonthLabel(d));
  const yValues = sortedSeries.map((p) => getNumericValue(p, valueKey));

  // Compute data bounds (ignoring nulls).
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const v of yValues) {
    if (v === null) continue;
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }

  const noData = !sortedSeries.length || yMin === Infinity || yMax === -Infinity;

  if (noData) {
    return (
      <div className="chart-panel">
        <div className="chart-panel-header">
          <h3 className="chart-panel-title">{title}</h3>
        </div>
        <div className="chart-panel__empty">
          Not available for this selection.
        </div>
      </div>
    );
  }

  if (clampYMinToZero) {
    yMin = Math.min(0, yMin);
  }

  // Helper to convert two indices into a SelectionSummary.
  const computeSelection = (
    startIndex: number,
    endIndex: number,
  ): SelectionSummary | null => {
    const s = Math.max(0, Math.min(startIndex, endIndex));
    const e = Math.min(sortedSeries.length - 1, Math.max(startIndex, endIndex));
    if (e <= s) return null;

    const startPoint = sortedSeries[s];
    const endPoint = sortedSeries[e];
    const startValue = getNumericValue(startPoint, valueKey);
    const endValue = getNumericValue(endPoint, valueKey);

    if (startValue === null || endValue === null) return null;

    const absChange = endValue - startValue;
    const pctChange =
      startValue !== 0 ? (absChange / Math.abs(startValue)) * 100 : null;

    return {
      startIndex: s,
      endIndex: e,
      startDate: startPoint.date,
      endDate: endPoint.date,
      startValue,
      endValue,
      absChange,
      pctChange,
    };
  };

  // Handle clicks from ECharts: first click sets start, second click sets end.
  const handlePointClick = (params: any) => {
    if (typeof params?.dataIndex !== "number") return;
    const idx = params.dataIndex as number;

    if (pendingStartIndex === null) {
      setPendingStartIndex(idx);
      setSelection(null);
    } else {
      const summary = computeSelection(pendingStartIndex, idx);
      setPendingStartIndex(null);
      setSelection(summary);
    }
  };

  const handleClearSelection = () => {
    setPendingStartIndex(null);
    setSelection(null);
  };

  const onEvents = {
    click: handlePointClick,
  };

  // Highlight the selected region (if any) using markArea.
  const markAreaData =
    selection && selection.startIndex < selection.endIndex
      ? [
          [
            { xAxis: xCategories[selection.startIndex] },
            { xAxis: xCategories[selection.endIndex] },
          ],
        ]
      : [];

  const option: EChartsOption = {
    animation: false,
    grid: { top: 24, left: 56, right: 16, bottom: 52 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params;
        const idx: number =
          typeof first?.dataIndex === "number" ? first.dataIndex : 0;
        const value = yValues[idx];
        const label = xCategories[idx] ?? "";
        const formatted = tooltipFormat(value);
        return `${label}<br/>${title}: ${formatted}`;
      },
    },
    xAxis: {
      type: "category",
      data: xCategories,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: { color: "#6b7280" },
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: {
        color: "#6b7280",
        formatter: (val: any) => {
          const num = typeof val === "number" ? val : Number(val);
          return Number.isFinite(num) ? axisFormat(num) : "";
        },
      },
      name: valueAxisLabel,
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: {
        color: "#6b7280",
        fontSize: 12,
        fontWeight: 400,
      },
    },
    series: [
      {
        type: "line",
        name: title,
        data: yValues,
        connectNulls: true,
        showSymbol: false,
        smooth: false,
        step: step ? "end" : false,
        lineStyle: { width: 2 },
        itemStyle: {
          opacity: 0,
        },
        emphasis: {
          focus: "series",
          itemStyle: {
            opacity: 1,
          },
        },
        markArea: {
          itemStyle: {
            color: "rgba(59, 130, 246, 0.08)",
          },
          data: markAreaData,
        },
      } as any,
    ],
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
      },
    ],
  };

  const hasSelection = !!selection;
  const selectionColor =
    selection && selection.absChange >= 0 ? "#16a34a" : "#dc2626";

  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <h3 className="chart-panel-title">{title}</h3>
      </div>

      <div className="chart-panel-body">
        <ReactECharts
          option={option}
          style={{ width: "100%", height: "260px" }}
          notMerge={true}
          lazyUpdate={true}
          onEvents={onEvents}
        />
      </div>

      {hasSelection && selection && (
        <div className="chart-panel-selection">
          <div className="chart-panel-selection-main">
            <div className="chart-panel-selection-label">
              {formatIsoMonthLabel(selection.startDate)} →{" "}
              {formatIsoMonthLabel(selection.endDate)}
            </div>
            <div className="chart-panel-selection-values">
              <span>
                Change:{" "}
                <span style={{ color: selectionColor }}>
                  {treatAsPercentScale
                    ? `${
                        selection.absChange >= 0 ? "+" : ""
                      }${selection.absChange.toFixed(1)} pts`
                    : `${
                        selection.absChange >= 0 ? "+" : ""
                      }${defaultValueFormatter(selection.absChange)}`}
                </span>
              </span>
              {selection.pctChange !== null && (
                <span style={{ marginLeft: "1rem", color: selectionColor }}>
                  % change:{" "}
                  {selection.pctChange !== null &&
                    `${
                      selection.pctChange >= 0 ? "+" : ""
                    }${defaultPercentFormatter(selection.pctChange)}`}
                </span>
              )}
            </div>
            <div className="chart-panel-selection-sub">
              From {tooltipFormat(selection.startValue)} to{" "}
              {tooltipFormat(selection.endValue)}
            </div>
          </div>
          <button
            type="button"
            className="chart-panel-selection-clear"
            onClick={handleClearSelection}
          >
            Clear range
          </button>
        </div>
      )}
    </div>
  );
};

export { ChartPanel };
