import type { PanelPoint, RegionCode } from "./types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";

/**
 * Load tab data from static JSON produced by ETL / scripts.
 * Example paths:
 *  - /data/processed/prices.json
 *  - /data/processed/sales_listings.json
 *  - /data/processed/rates_bonds.json
 */
export async function loadTabData(tabKey: string): Promise<PanelPoint[]> {
  const res = await fetch(`/data/processed/${tabKey}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load data for tab ${tabKey}`);
  }
  return res.json();
}

/**
 * For a given region + segment, build a "snapshot" for each requested metric:
 * the latest point and the previous point (for MoM delta).
 */
export function getLatestByMetric(
  points: PanelPoint[],
  region: RegionCode,
  metrics: string[],
  segment: string = "all"
): MetricSnapshot[] {
  // Filter by region, segment and metric inclusion list
  const filtered = points.filter((p) => {
    if (p.region !== region) return false;
    if (segment !== "all" && p.segment !== segment) return false;
    if (!metrics.includes(p.metric)) return false;
    return true;
  });

  // Group by metric
  const byMetric: Record<string, PanelPoint[]> = {};
  for (const p of filtered) {
    if (!byMetric[p.metric]) byMetric[p.metric] = [];
    byMetric[p.metric].push(p);
  }

  // Build snapshots in the same order as `metrics`
  const snapshots: MetricSnapshot[] = [];

  for (const metric of metrics) {
    const series = byMetric[metric];
    if (!series || series.length === 0) continue;

    // Sort by date ascending (ISO strings => lexical order works)
    series.sort((a, b) => a.date.localeCompare(b.date));

    const latest = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;

    snapshots.push({
      metric,
      latest,
      prev,
    });
  }

  return snapshots;
}
