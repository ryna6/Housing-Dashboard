import React from "react";

export const RentalsTab: React.FC = () => {
  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rentals</h1>
        <p className="tab__subtitle">
          Rents & vacancy (CMHC, TRREB / GVR where available)
        </p>
      </header>
      <p className="tab__status">
        This tab will show equity and credit market signals and a simple risk
        composite once external market data sources are integrated.
      </p>
    </div>
  );
};
