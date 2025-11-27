export type TabKey =
  | "prices"
  | "sales"
  | "supply"
  | "rates"
  | "inflation"
  | "credit"
  | "market"
  | "rentals";

export interface TabMeta {
  key: TabKey;
  label: string;
  icon: string;
}

export const TABS: TabMeta[] = [
  { key: "prices", label: "Prices", icon: "₱" },
  { key: "sales", label: "Sales", icon: "⧉" },
  { key: "supply", label: "Supply", icon: "🏗" },
  { key: "rates", label: "Rates", icon: "🏛" },
  { key: "inflation", label: "Inflation", icon: "↗" },
  { key: "credit", label: "Credit", icon: "⚠" },
  { key: "market", label: "Market", icon: "🗠" },
  { key: "rentals", label: "Rentals", icon: "⌂" }
];
