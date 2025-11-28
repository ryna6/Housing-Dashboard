// All region codes used anywhere in the app
export type RegionCode =
  | "canada"
  | "greater_vancouver"
  | "lower_mainland"
  | "calgary"
  | "greater_toronto"
  | "montreal";

// Segment values:
// - "all" / "condo" / "freehold" are used by the Sales Listings tab
// - Housing-type segments are used by the Prices tab
export type Segment =
  | "all"
  | "condo"
  | "freehold"
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
