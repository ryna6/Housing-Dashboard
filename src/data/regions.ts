import type { MarketCode, RegionCode } from "./types";

export const REGIONS_BY_MARKET: Record<MarketCode, RegionCode[]> = {
  canada: [],
  on: ["gta", "hamilton", "halton", "niagara"],
  bc: ["vancouver", "burnaby", "surrey", "richmond", "victoria"]
};

export const REGION_LABELS: Record<RegionCode, string> = {
  canada: "Canada",
  on: "Ontario",
  bc: "British Columbia",
  gta: "GTA",
  hamilton: "Hamilton",
  halton: "Halton",
  niagara: "Niagara",
  vancouver: "Vancouver",
  burnaby: "Burnaby",
  surrey: "Surrey",
  richmond: "Richmond",
  victoria: "Victoria"
};
