export type MarketCode = "canada" | "on" | "bc";

export type RegionCode =
  | MarketCode
  | "gta"
  | "hamilton"
  | "halton"
  | "niagara"
  | "vancouver"
  | "burnaby"
  | "surrey"
  | "richmond"
  | "victoria";

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
