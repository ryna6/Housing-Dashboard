export type RegionCode =
  | MarketCode
  | "canada"
  | "greater_vancouver"
  | "lower_mainland"
  | "calgary"
  | "greater_toronto"
  | "montreal";

export type Segment =
  | "composite"
  | "one_storey"
  | "two_storey"
  | "townhouse"
  | "apartment";

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
