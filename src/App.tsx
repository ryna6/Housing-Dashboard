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

// Single App component – allows Overview to navigate to other tabs via cards
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
