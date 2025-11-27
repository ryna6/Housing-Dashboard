import React, { useState } from "react";
import { PricesTab } from "./tabs/PricesTab";
import { SalesListingsTab } from "./tabs/SalesListingsTab";
import { SupplyTab } from "./tabs/SupplyTab";
import { RatesBondsTab } from "./tabs/RatesBondsTab";
import { InflationTab } from "./tabs/InflationTab";
import { CreditTab } from "./tabs/CreditTab";
import { MarketTab } from "./tabs/MarketTab";
import { RentalsTab } from "./tabs/RentalsTab";
import { BottomTabNav, TabId } from "./components/BottomTabNav";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>("prices");

  const renderTab = () => {
    switch (activeTab) {
      case "prices":
        return <PricesTab />;
      case "sales":
        return <SalesListingsTab />;
      case "supply":
        return <SupplyTab />;
      case "rates":
        return <RatesBondsTab />;
      case "inflation":
        return <InflationTab />;
      case "credit":
        return <CreditTab />;
      case "market":
        return <MarketTab />;
      case "rentals":
        return <RentalsTab />;
      default:
        return <PricesTab />;
    }
  };

  return (
    <div className="app">
      <main className="app__content">
        <div className="app__inner">
          {renderTab()}
        </div>
      </main>
      <BottomTabNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
};

export default App;
