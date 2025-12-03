import React, { useState } from "react";
import type { TabKey } from "./tabs/tabConfig";

import { OverviewTab } from "./tabs/OverviewTab";
import { PricesTab } from "./tabs/PricesTab";
import { SalesListingsTab } from "./tabs/SalesListingsTab";
import { SupplyTab } from "./tabs/SupplyTab";
import { RatesBondsTab } from "./tabs/RatesBondsTab";
import { InflationLabourTab } from "./tabs/InflationLabourTab";
import { CreditTab } from "./tabs/CreditTab";
import { MarketTab } from "./tabs/MarketTab";
import { RentalsTab } from "./tabs/RentalsTab";
import { BottomTabNav } from "./components/BottomTabNav";

// Allows overview tab to change tabs when clicking a card
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab onNavigateTab={setActiveTab} />;
      case "prices":
        return <PricesTab />;
      case "sales":
        return <SalesListingsTab />;
      case "supply":
        return <SupplyTab />;
      case "rates":
        return <RatesBondsTab />;
      case "inflation":
        return <InflationLabourTab />;
      case "credit":
        return <CreditTab />;
      case "market":
        return <MarketTab />;
      case "rentals":
        return <RentalsTab />;
      default:
        return <OverviewTab onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <div className="app">
      <main className="app__content">
        <div className="app__inner">{renderTab()}</div>
      </main>
      <BottomTabNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
};

export default App;

/**
 * Tab IDs must match what BottomTabNav uses internally.
 * We define this locally instead of importing a type.
 */
type TabId =
  | "overview"
  | "prices"
  | "sales"
  | "supply"
  | "rates"
  | "inflation"
  | "credit"
  | "market"
  | "rentals";

const PlaceholderTab: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">{title}</h1>
        {subtitle && <p className="tab__subtitle">{subtitle}</p>}
      </header>
      <div className="tab__status">
        This tab is not fully implemented yet.
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab />;
      
      case "prices":
        return <PricesTab />;
      case "sales":
        return <SalesListingsTab />;
      case "supply":
        return <SupplyTab />;
      case "rates":
        return <RatesBondsTab />;
      case "inflation":
        return <InflationLabourTab />;
      case "credit":
        return <CreditTab />;
      case "market":
        return <MarketTab />;
      case "rentals":
        return <RentalsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="app">
      <main className="app__content">
        <div className="app__inner">{renderTab()}</div>
      </main>
      <BottomTabNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
};

export default App;
