import React, { useState } from "react";
import { BottomTabNav } from "./components/BottomTabNav";
import { PricesTab } from "./tabs/PricesTab";
import { SalesListingsTab } from "./tabs/SalesListingsTab";
import { SupplyPipelineTab } from "./tabs/SupplyPipelineTab";
import { RatesBondsTab } from "./tabs/RatesBondsTab";
import { InflationLabourTab } from "./tabs/InflationLabourTab";
import { CreditStressTab } from "./tabs/CreditStressTab";
import { MarketRiskTab } from "./tabs/MarketRiskTab";
import { RentalsTab } from "./tabs/RentalsTab";
import type { TabKey } from "./tabs/tabConfig";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("prices");

  const renderTab = () => {
    switch (activeTab) {
      case "prices":
        return <PricesTab />;
      case "sales":
        return <SalesListingsTab />;
      case "supply":
        return <SupplyPipelineTab />;
      case "rates":
        return <RatesBondsTab />;
      case "inflation":
        return <InflationLabourTab />;
      case "credit":
        return <CreditStressTab />;
      case "market":
        return <MarketRiskTab />;
      case "rentals":
        return <RentalsTab />;
      default:
        return null;
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

export default App;
