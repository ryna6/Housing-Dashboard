import type { PanelPoint, RegionCode } from "./types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";

export async function loadTabData(tabKey: string): Promise<PanelPoint[]> {
  const url = `/data/processed/${tabKey}.json`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`Failed to load data for tab ${tabKey}: ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json as PanelPoint[];
}

export function getLatestByMetric(
  points: PanelPoint[],
  region: RegionCode,
  metrics: string[],
  segment?: string
): MetricSnapshot[] {
  const snapshots: MetricSnapshot[] = [];

  const matchesSegment = (seg: string) => {
    if (!segment || segment === "all") return true;
    return seg === segment;
  };

  for (const metric of metrics) {
    const series = points
      .filter(
        (p) =>
          p.metric === metric &&
          p.region === region &&
          matchesSegment(String(p.segment))
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!series.length) continue;

    const latest = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    snapshots.push({ metric, latest, prev });
  }

  return snapshots;
}
