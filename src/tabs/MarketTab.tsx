// src/tabs/MarketTab.tsx
import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "../hooks/useTabData";

type PanelPoint = {
  date: string;      // "YYYY-MM-01"
  region: string;    // "ca"
  segment: string;   // "market"
  metric: string;
  value: number;
  unit: string;      // "cad" | "index"
  source: string;
  mom_pct: number | null;
  yoy_pct: number | null;
  ma3: number | null;
};

const REGION = "ca";
const SEGMENT = "market";

const METRIC_GDP = "ca_real_gdp";
const METRIC_TSX = "tsx_composite_index";
const METRIC_XRE = "xre_price_index";
const METRIC_M2 = "ca_m2";
const METRIC_M2PP = "ca_m2pp";

function filterSeries(
  points: PanelPoint[] | undefined,
  metric: string
): PanelPoint[] {
  if (!points) return [];
  return points
    .filter(
      (p) =>
        p.segment === SEGMENT &&
        p.region === REGION &&
        p.metric === metric &&
        p.value != null
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getLatest(points: PanelPoint[] | undefined, metric: string) {
  const series = filterSeries(points, metric);
  return series.length ? series[series.length - 1] : undefined;
}

function trimLastYears(
  series: PanelPoint[],
  years: number
): PanelPoint[] {
  if (!series.length) return series;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return series.filter((p) => new Date(p.date) >= cutoff);
}

function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  let scaled = value;
  let suffix = "";
  if (abs >= 1e12) {
    scaled = value / 1e12;
    suffix = "T";
  } else if (abs >= 1e9) {
    scaled = value / 1e9;
    suffix = "B";
  } else if (abs >= 1e6) {
    scaled = value / 1e6;
    suffix = "M";
  } else if (abs >= 1e3) {
    scaled = value / 1e3;
    suffix = "K";
  }
  const decimals = Math.abs(scaled) >= 10 ? 0 : 1;
  return `$${scaled.toFixed(decimals)}${suffix}`;
}

function formatIndex(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return value.toFixed(value >= 100 ? 0 : 1);
}

function formatPct(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  const decimals = Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}%`;
}

export const MarketTab: React.FC = () => {
  const { data, loading, error } = useTabData("market");

  const gdpLatest = useMemo(
    () => getLatest(data as PanelPoint[] | undefined, METRIC_GDP),
    [data]
  );
  const tsxLatest = useMemo(
    () => getLatest(data as PanelPoint[] | undefined, METRIC_TSX),
    [data]
  );
  const xreLatest = useMemo(
    () => getLatest(data as PanelPoint[] | undefined, METRIC_XRE),
    [data]
  );
  const m2Latest = useMemo(
    () => getLatest(data as PanelPoint[] | undefined, METRIC_M2),
    [data]
  );
  const m2ppLatest = useMemo(
    () => getLatest(data as PanelPoint[] | undefined, METRIC_M2PP),
    [data]
  );

  const gdpSeries = useMemo(
    () => trimLastYears(filterSeries(data as PanelPoint[] | undefined, METRIC_GDP), 15),
    [data]
  );
  const tsxSeries = useMemo(
    () => trimLastYears(filterSeries(data as PanelPoint[] | undefined, METRIC_TSX), 15),
    [data]
  );
  const xreSeries = useMemo(
    () => trimLastYears(filterSeries(data as PanelPoint[] | undefined, METRIC_XRE), 15),
    [data]
  );
  const m2Series = useMemo(
    () => trimLastYears(filterSeries(data as PanelPoint[] | undefined, METRIC_M2), 15),
    [data]
  );
  const m2ppSeries = useMemo(
    () => trimLastYears(filterSeries(data as PanelPoint[] | undefined, METRIC_M2PP), 15),
    [data]
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  const points = data as PanelPoint[] | undefined;
  if (!points || !points.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No Market data available. Make sure you’ve run the StatCan + Finnhub
        generators.
      </div>
    );
  }

  const moneySeriesCombined = [
    { id: "M2", series: m2Series },
    { id: "M2++", series: m2ppSeries },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
        <p className="text-sm text-muted-foreground">
          Macro and market indicators for Canada (GDP, TSX, REITs, money
          supply).
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Real GDP card */}
        <MetricSnapshotCard
          title="Real GDP (Canada)"
          value={formatCompactCurrency(gdpLatest?.value ?? null)}
          unit="CAD"
          mom={gdpLatest?.mom_pct ?? null}
          yoy={gdpLatest?.yoy_pct ?? null}
          momLabel="MoM"
          yoyLabel="YoY"
        />

        {/* TSX Composite index card */}
        <MetricSnapshotCard
          title="S&P/TSX Composite index"
          value={formatIndex(tsxLatest?.value ?? null)}
          unit="Index"
          mom={tsxLatest?.mom_pct ?? null}
          yoy={tsxLatest?.yoy_pct ?? null}
          momLabel="MoM"
          yoyLabel="YoY"
        />

        {/* XRE ETF index card */}
        <MetricSnapshotCard
          title="XRE real estate ETF index"
          value={formatIndex(xreLatest?.value ?? null)}
          unit="Index"
          mom={xreLatest?.mom_pct ?? null}
          yoy={xreLatest?.yoy_pct ?? null}
          momLabel="MoM"
          yoyLabel="YoY"
        />

        {/* Combined M2 / M2++ card */}
        <MetricSnapshotCard
          title="M2 / M2++ money supply"
          value={`${formatCompactCurrency(m2Latest?.value ?? null)} / ${formatCompactCurrency(
            m2ppLatest?.value ?? null
          )}`}
          unit="CAD"
          // You can expose both YoY rates in a subtitle or secondary field,
          // depending on how MetricSnapshotCard is implemented.
          subtitle={
            m2Latest?.yoy_pct != null && m2ppLatest?.yoy_pct != null
              ? `YoY: ${formatPct(m2Latest.yoy_pct)} (M2), ${formatPct(
                  m2ppLatest.yoy_pct
                )} (M2++)`
              : undefined
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Real GDP */}
        <ChartPanel
          title="Real GDP (Canada, chained 2017 dollars)"
          series={[
            {
              id: "Real GDP",
              data: gdpSeries,
              valueKey: "value",
              dateKey: "date",
              unit: "cad",
            },
          ]}
          yAxisFormatter={formatCompactCurrency}
          tooltipValueFormatter={(v: number) => formatCompactCurrency(v)}
        />

        {/* TSX Composite */}
        <ChartPanel
          title="S&P/TSX Composite index"
          series={[
            {
              id: "TSX Composite",
              data: tsxSeries,
              valueKey: "value",
              dateKey: "date",
              unit: "index",
            },
          ]}
          yAxisFormatter={formatIndex}
          tooltipValueFormatter={(v: number) => formatIndex(v)}
        />

        {/* XRE ETF */}
        <ChartPanel
          title="XRE real estate ETF index"
          series={[
            {
              id: "XRE ETF",
              data: xreSeries,
              valueKey: "value",
              dateKey: "date",
              unit: "index",
            },
          ]}
          yAxisFormatter={formatIndex}
          tooltipValueFormatter={(v: number) => formatIndex(v)}
        />

        {/* Money supply: M2 vs M2++ */}
        <ChartPanel
          title="Money supply: M2 vs M2++"
          series={moneySeriesCombined.map((s) => ({
            id: s.id,
            data: s.series,
            valueKey: "value",
            dateKey: "date",
            unit: "cad",
          }))}
          yAxisFormatter={formatCompactCurrency}
          tooltipValueFormatter={(v: number) => formatCompactCurrency(v)}
          legend
        />
      </div>
    </div>
  );
};
