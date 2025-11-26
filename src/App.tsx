import React, { useState } from "react";
import { BottomTabNav, TabKey } from "./components/BottomTabNav";
import { PricesTab } from "./tabs/PricesTab";
import { SalesListingsTab } from "./tabs/SalesListingsTab";
import { SupplyPipelineTab } from "./tabs/SupplyPipelineTab";
import { RatesBondsTab } from "./tabs/RatesBondsTab";
import { InflationLabourTab } from "./tabs/InflationLabourTab";
import { CreditStressTab } from "./tabs/CreditStressTab";
import { MarketRiskTab } from "./tabs/MarketRiskTab";
import { RentalsTab } from "./tabs/RentalsTab";

export const App: React.FC = () => {
  const [active, setActive] = useState<TabKey>("prices");

  const renderTab = () => {
    switch (active) {
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
      <main className="app__content">{renderTab()}</main>
      <BottomTabNav active={active} onChange={setActive} />
    </div>
  );
};

export default App;
