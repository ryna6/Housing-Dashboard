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

const HEADLINE_METRICS: string[] = [
  "ca_real_gdp",
  "tsx_composite_index",
  "xre_price_index",
];

const CARD_TITLES: Record<string, string> = {
  ca_real_gdp: "Real GDP (Canada)",
  tsx_composite_index: "S&P/TSX Composite index",
  xre_price_index: "XRE real estate ETF index",
};

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

function formatIndex(value: number): string {
  if (!Number.isFinite(value)) return "–";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const decimals = Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}%`;
}

export const MarketTab: React.FC = () => {
  const { data, loading, error } = useTabData("market");

  const snapshots: MetricSnapshot[] = useMemo(() => {
    if (!data || !data.length) return [];
    return getLatestByMetric(data, REGION, HEADLINE_METRICS, SEGMENT);
  }, [data]);

  const moneySnapshots: MetricSnapshot[] = useMemo(() => {
    if (!data || !data.length) return [];
    return getLatestByMetric(data, REGION, ["ca_m2", "ca_m2pp"], SEGMENT);
  }, [data]);

  const gdpSeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            p.metric === "ca_real_gdp" &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        15
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
        15
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
        15
      ),
    [data]
  );

  // Combined money series: includes BOTH M2 and M2++
  const moneySeries: PanelPoint[] = useMemo(
    () =>
      trimLastYears(
        (data || []).filter(
          (p) =>
            (p.metric === "ca_m2" || p.metric === "ca_m2pp") &&
            p.region === REGION &&
            p.segment === SEGMENT
        ),
        15
      ),
    [data]
  );

  const hasData = !!data && data.length > 0;

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
      {error && (
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

            {/* Combined M2 / M2++ card with MoM + YoY */}
            <div className="metric-card">
              <div className="metric-card__title">M2 / M2++ money supply</div>
              <div className="metric-card__value">
                {(() => {
                  const m2 = moneySnapshots.find((s) => s.metric === "ca_m2");
                  const m2pp = moneySnapshots.find(
                    (s) => s.metric === "ca_m2pp"
                  );
                  const v1 = m2 ? m2.latest.value : NaN;
                  const v2 = m2pp ? m2pp.latest.value : NaN;
                  return `${formatCurrencyCompact(
                    v1
                  )} / ${formatCurrencyCompact(v2)}`;
                })()}
              </div>
              <div className="metric-card__delta-row">
                {(() => {
                  const m2 = moneySnapshots.find((s) => s.metric === "ca_m2");
                  const m2pp = moneySnapshots.find(
                    (s) => s.metric === "ca_m2pp"
                  );

                  const mom1 = m2?.latest.mom_pct ?? null;
                  const mom2 = m2pp?.latest.mom_pct ?? null;
                  const yoy1 = m2?.latest.yoy_pct ?? null;
                  const yoy2 = m2pp?.latest.yoy_pct ?? null;

                  if (
                    mom1 == null &&
                    mom2 == null &&
                    yoy1 == null &&
                    yoy2 == null
                  ) {
                    return null;
                  }

                  return (
                    <>
                      {(mom1 != null || mom2 != null) && (
                        <span className="metric-card__delta-label">
                          MoM: {formatPercent(mom1)} (M2),{" "}
                          {formatPercent(mom2)} (M2++)
                        </span>
                      )}
                      {(yoy1 != null || yoy2 != null) && (
                        <span className="metric-card__delta-label">
                          YoY: {formatPercent(yoy1)} (M2),{" "}
                          {formatPercent(yoy2)} (M2++)
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* Charts */}
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
              title="Money supply (M2 vs M2++)"
              series={moneySeries}
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
