import React from "react";

export const CreditStressTab: React.FC = () => {
  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Credit</h1>
        <p className="tab__subtitle">
          Insolvencies, arrears & credit stress (coming soon)
        </p>
      </header>
      <p className="tab__status">
        This tab will visualize OSB insolvency data, CMHC mortgage arrears and
        other credit stress indicators in v1 once the ETL is wired.
      </p>
    </div>
  );
};
