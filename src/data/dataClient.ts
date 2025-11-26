import type { PanelPoint, RegionCode } from "./types";

export async function loadTabData(tabKey: string): Promise<PanelPoint[]> {
  const res = await fetch(`/data/processed/${tabKey}.json`);
  if (!res.ok) {
    console.error(`Failed to load data for tab ${tabKey}: ${res.status}`);
    return [];
  }

  try {
    const json = await res.json();
    return Array.isArray(json) ? (json as PanelPoint[]) : [];
  } catch (err) {
    console.error("Error parsing JSON for tab", tabKey, err);
    return [];
  }
}

export function getLatestByMetric(
  points: PanelPoint[],
  region: RegionCode,
  metrics: string[],
  segment: string = "all"
) {
  const filtered = points.filter(
    (p) =>
      p.region === region &&
      p.segment === segment &&
      metrics.includes(p.metric)
  );

  const latestDate = filtered.reduce<string | null>((acc, p) => {
    if (!acc) return p.date;
    return p.date > acc ? p.date : acc;
  }, null);

  if (!latestDate) return [];

  return metrics
    .map((metric) => {
      const series = filtered
        .filter((p) => p.metric === metric)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (series.length === 0) return null;

      const latest = series[series.length - 1];
      const prev = series.length > 1 ? series[series.length - 2] : null;

      return { metric, latest, prev };
    })
    .filter((s): s is { metric: string; latest: PanelPoint; prev: PanelPoint | null } => s !== null);
}
