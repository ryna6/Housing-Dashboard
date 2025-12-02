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

// Headline metrics for standard snapshot cards
const HEADLINE_METRICS: string[] = [
  "ca_real_gdp",
  "tsx_composite_index",
  "xre_price_index",
];

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

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const decimals = Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}%`;
}

const CARD_TITLES: Record<string, string> = {
  ca_real_gdp: "Real GDP (Canada)",
  tsx_composite_index: "S&P/TSX Composite index",
  xre_price_index: "XRE real estate ETF index",
};

export const MarketTab: React.FC = () => {
  const { data, loading, error } = useTabData("market");

  const hasData = !!data && data.length > 0;

  // Standard headline snapshots (GDP, TSX, XRE)
  const snapshots: MetricSnapshot[] = useMemo(() => {
    if (!data || !data.length) return [];
    return getLatestByMetric(data, REGION, HEADLINE_METRICS, SEGMENT);
  }, [data]);

  // Money supply snapshot for M2 only
  const m2Snapshot: MetricSnapshot | null = useMemo(() => {
    if (!data || !data.length) return null;
    const [snap] = getLatestByMetric(data, REGION, ["ca_m2"], SEGMENT);
    return snap ?? null;
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
          Macro and market indicators for Canada (GDP, TSX, REITs, money
          supply).
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
          <section className="tab__metrics tab__metrics--wide">
            {snapshots.map((snapshot) => (
              <MetricSnapshotCard
                key={snapshot.metric}
                snapshot={snapshot}
                titleOverride={CARD_TITLES[snapshot.metric] ?? undefined}
              />
            ))}

            {/* M2 money supply card */}
            {m2Snapshot && (
              <div className="metric-card">
                <div className="metric-card__title">Money supply (M2)</div>
                <div className="metric-card__value">
                  {formatCurrencyCompact(m2Snapshot.latest.value)}
                </div>
                <div className="metric-card__delta-row">
                  <span className="metric-card__delta-label">
                    MoM: {formatPercent(m2Snapshot.latest.mom_pct)}
                  </span>
                </div>
                <div className="metric-card__delta-row">
                  <span className="metric-card__delta-label">
                    YoY: {formatPercent(m2Snapshot.latest.yoy_pct)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Charts – all trimmed to last 10 years */}
          <section className="tab__charts">
            <ChartPanel
              title="Real GDP (Canada)"
              series={gdpSeries}
              valueKey="value"
              valueFormatter={formatCurrencyCompact}
              clampYMinToZero
            />
            <ChartPanel
              title="S&P/TSX Composite index"
              series={tsxSeries}
              valueKey="value"
              valueFormatter={formatIndex}
              clampYMinToZero
            />
            <ChartPanel
              title="XRE real estate ETF index"
              series={xreSeries}
              valueKey="value"
              valueFormatter={formatIndex}
              clampYMinToZero
            />
            <ChartPanel
              title="Money supply (M2)"
              series={m2Series}
              valueKey="value"
              valueFormatter={formatCurrencyCompact}
              clampYMinToZero
            />
          </section>
        </>
      )}
    </div>
  );
};
