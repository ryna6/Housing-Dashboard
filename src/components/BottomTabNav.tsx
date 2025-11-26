import React from "react";

type TabKey =
  | "prices"
  | "sales"
  | "supply"
  | "rates"
  | "inflation"
  | "credit"
  | "market"
  | "rentals";

interface TabDef {
  key: TabKey;
  label: string;
  icon: string; // simple emoji for now
}

const TABS: TabDef[] = [
  { key: "prices",    label: "Prices",        icon: "🏠" },
  { key: "sales",     label: "Sales",         icon: "📊" },
  { key: "supply",    label: "Supply",        icon: "🏗️" },
  { key: "rates",     label: "Rates",         icon: "💰" },
  { key: "inflation", label: "Inflation",     icon: "📈" },
  { key: "credit",    label: "Credit",        icon: "⚠️" },
  { key: "market",    label: "Market",        icon: "📉" },
  { key: "rentals",   label: "Rentals",       icon: "🏢" },
];

interface Props {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export const BottomTabNav: React.FC<Props> = ({ active, onChange }) => {
  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.key}
          className={`bottom-nav__item ${active === tab.key ? "bottom-nav__item--active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          <span className="bottom-nav__icon">{tab.icon}</span>
          <span className="bottom-nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

