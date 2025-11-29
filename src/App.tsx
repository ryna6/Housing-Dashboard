import React, { useState } from "react";
import { PricesTab } from "./tabs/PricesTab";
import { SalesListingsTab } from "./tabs/SalesListingsTab";
import { SupplyTab } from "./tabs/SupplyTab";
import { RatesBondsTab } from "./tabs/RatesBondsTab";
import { InflationLabourTab } from "./tabs/InflationLabourTab";
import { CreditTab } from "./tabs/CreditTab";
import { RentalsTab } from "./tabs/RentalsTab";
import { BottomTabNav } from "./components/BottomTabNav";

/**
 * Tab IDs must match what BottomTabNav uses internally.
 * We define this locally instead of importing a type.
 */
type TabId =
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
        return <InflationLabourTab />;
      case "credit":
        return <CreditTab />;
      case "market":
        return (
          <PlaceholderTab
            title="Market"
            subtitle="Equity and credit spread proxies (coming soon)."
          />
        );
      case "rentals":
        return <RentalsTab />;
      default:
        return <PricesTab />;
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
