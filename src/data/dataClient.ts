import type { PanelPoint, RegionCode } from "./types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";

/**
 * Load tab data from static JSON produced by ETL.
 * Example:
 *  - /data/processed/prices.json
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
 * - latest: most recent observation
 * - prev: most recent observation with a *different* value (if any)
 *
 * This is important for step-like series such as policy_rate, where the last
 * few months may all share the same level – in that case we still want to
 * show the change from the last time the rate moved.
 */
export function getLatestByMetric(
  points: PanelPoint[],
  region: RegionCode,
  metrics: string[],
  segment: string = "all"
): MetricSnapshot[] {
  const filtered = points.filter((p) => {
    if (p.region !== region) return false;
    if (segment !== "all" && p.segment !== segment) return false;
    if (!metrics.includes(p.metric)) return false;
    return true;
  });

  const byMetric: Record<string, PanelPoint[]> = {};
  for (const p of filtered) {
    if (!byMetric[p.metric]) byMetric[p.metric] = [];
    byMetric[p.metric].push(p);
  }

  const snapshots: MetricSnapshot[] = [];

  for (const metric of metrics) {
    const series = byMetric[metric];
    if (!series || series.length === 0) continue;

    // sort ascending by date
    series.sort((a, b) => a.date.localeCompare(b.date));

    const latest = series[series.length - 1];
    let prev: PanelPoint | null = null;

    // Walk backwards until we find a *different* value
    for (let i = series.length - 2; i >= 0; i--) {
      if (series[i].value !== latest.value) {
        prev = series[i];
        break;
      }
    }

    snapshots.push({
      metric,
      latest,
      prev,
    });
  }

  return snapshots;
}
