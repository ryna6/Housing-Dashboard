// Top-level market buckets used by MarketSelector on other tabs
export type MarketCode = "canada" | "on" | "bc";

// All region codes used anywhere in the app
// - Original city-level regions (GTA, Hamilton, etc.) for Rentals/Sales
// - New aggregate regions for the Prices tab (greater_vancouver, lower_mainland, etc.)
export type RegionCode =
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
  // Aggregate / new regions for the Prices tab
  | "greater_vancouver"
  | "lower_mainland"
  | "calgary"
  | "greater_toronto"
  | "montreal";

// Segment values:
// - "all" / "condo" / "freehold" are used by the SalesListings tab
// - The housing-type segments are used by the new Prices tab
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
