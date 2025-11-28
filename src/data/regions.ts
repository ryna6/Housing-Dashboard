import type { MarketCode, RegionCode } from "./types";

// Regions grouped by market for the Rentals / Sales tabs
export const REGIONS_BY_MARKET: Record<MarketCode, RegionCode[]> = {
  canada: [],
  on: ["gta", "hamilton", "halton", "niagara", "greater_toronto"],
  bc: [
    "vancouver",
    "burnaby",
    "surrey",
    "richmond",
    "victoria",
    "greater_vancouver",
    "lower_mainland",
  ],
};

export const REGION_LABELS: Record<RegionCode, string> = {
  // Markets
  canada: "Canada",
  on: "Ontario",
  bc: "British Columbia",

  // Original city / region codes
  gta: "GTA",
  hamilton: "Hamilton",
  halton: "Halton",
  niagara: "Niagara",
  vancouver: "Vancouver",
  burnaby: "Burnaby",
  surrey: "Surrey",
  richmond: "Richmond",
  victoria: "Victoria",

  // New aggregate regions for the Prices tab
  greater_vancouver: "Greater Vancouver",
  lower_mainland: "Lower Mainland (Burnaby, Surrey, New West, Coquitlam)",
  calgary: "Calgary",
  greater_toronto: "Greater Toronto Area",
  montreal: "Montreal",
};
