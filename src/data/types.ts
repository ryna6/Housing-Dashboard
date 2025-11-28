// Top-level market buckets used by the legacy MarketSelector component
// (kept for compatibility; the new tabs use the unified Regions selector)
export type MarketCode = "canada" | "on" | "bc";

// All region codes used anywhere in the app
// - Original city-level regions (GTA, Hamilton, etc.) for older tabs / data
// - New aggregate regions for the unified Regions selector
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
  | "victoria"
  // New aggregate regions used by Prices / Sales / Rentals
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
