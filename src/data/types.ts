export type RegionCode = "canada" | "on" | "bc" | "gta" | "metro_vancouver";
export type Segment = "all" | "condo" | "freehold";

export interface PanelPoint {
  date: string; // ISO date string
  region: RegionCode;
  segment: Segment | string;
  metric: string;
  value: number;
  unit: string;
  source: string;
  mom_pct: number | null;
  yoy_pct: number | null;
  ma3: number | null;
}

