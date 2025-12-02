// src/tabs/MarketTab.tsx
import React, { useMemo } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

const REGION: RegionCode = "canada";
const SEGMENT = "market";

// We now include M2 as a headline metric.
// This gives us 4 cards: GDP, TSX, XRE, M2.
const HEADLINE_METRICS: string[] = [
  "ca_real_gdp",
  "tsx_composite_index",
  "xre_price_index",
  "ca_m2",
];

const CARD_TITLES: Record<string, string> = {
  ca_real_gdp: "Real GDP",
  tsx_composite_index: "S&P/TSX Composite index",
  xre_price_index: "REIT index",
  ca_m2: "M2 money supply",
};

// Trim a series down to the last N years
function trimLastYears(series: PanelPoint[], years: number): PanelPoint[] {
  if (series.length <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return sorted.filter((p) => {
    const d = new Date(p.date);
    return d >= cutoff;
  });
}

// Compact CAD formatter (supports K / M / B / T)
function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) return "–";

  if (abs >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Simple index formatter (no suffix, 0–1 decimals)
function formatIndex(value: number): string {
  if (!Number.isFinite(value)) return "–";
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

/**
 * Tooltip formatter for GDP and money supply.
 */
function formatMoneyTooltip(value: number): string {
  if (!Number.isFinite(value)) return "–";

  const abs = Math.abs(value);
  let scaled = value;
  let suffix = "";

  if (abs >= 1_000_000_000_000) {
    scaled = value / 1_000_000_000_000;
    suffix = "T";
  } else if (abs >= 1_000_000_000) {
    scaled = value / 1_000_000_000;
    suffix = "B";
  } 
  // 3 decimal places in the tooltip
  return `$${scaled.toFixed(3)}${suffix}`;
}

export const MarketTab: React.FC = () => {
  const { data, loading, error } = useTabData("market");
  const hasData = !!data && data.length > 0;

  // Standard headline snapshots (GDP, TSX, XRE, M2)
  const snapshots: MetricSnapshot[] = useMemo(() => {
    if (!data || !data.length) return [];
    return getLatestByMetric(data, REGION, HEADLINE_METRICS, SEGMENT);
  }, [data]);

  // Time series (trimmed to last 10 years)
  const gdpSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            p.metric === "ca_real_gdp" &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        10
      ),
    [data]
  );

  const tsxSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            p.metric === "tsx_composite_index" &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        10
      ),
    [data]
  );

  const xreSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            p.metric === "xre_price_index" &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        10
      ),
    [data]
  );

  const m2Series: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            p.metric === "ca_m2" &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        10
      ),
    [data]
  );

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Market</h1>
        <p className="tab__subtitle">
          Canada GDP, S&P/TSX Index, Canadian REIT Index, M2 money supply (Statistics Canada & Alpha Vantage)
        </p>
      </header>

      {loading && <div className="tab__status">Loading market data…</div>}

      {error && !loading && (
        <div className="tab__status tab__status--error">
          Failed to load market data: {error}
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="tab__status">No market data available.</div>
      )}

      {!loading && !error && hasData && (
        <>
          {/* Snapshot cards */}
          <section className="tab__metrics">
            {snapshots.map((snapshot) => (
              <MetricSnapshotCard
                key={snapshot.metric}
                snapshot={snapshot}
                titleOverride={CARD_TITLES[snapshot.metric] ?? undefined}
              />
            ))}
          </section>

          {/* Charts – all trimmed to last 10 years */}
          <section className="tab__charts">
            <ChartPanel
              title="Real GDP"
              series={gdpSeries}
              valueKey="value"
              valueFormatter={formatCurrencyCompact}
              clampYMinToZero
            />
            <ChartPanel
              title="S&P/TSX composite index"
              series={tsxSeries}
              valueKey="value"
              valueFormatter={formatIndex}
              clampYMinToZero
            />
            <ChartPanel
              title="REIT index"
              series={xreSeries}
              valueKey="value"
              valueFormatter={formatIndex}
              clampYMinToZero
            />
            <ChartPanel
              title="M2 money supply"
              series={m2Series}
              valueKey="value"
              valueFormatter={formatCurrencyCompact}
              tooltipValueFormatter={formatMoneyTooltip}
              clampYMinToZero
            />
          </section>
        </>
      )}
    </div>
  );
};
