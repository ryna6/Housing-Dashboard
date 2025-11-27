import React from "react";

export const SupplyPipelineTab: React.FC = () => {
  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Supply</h1>
        <p className="tab__subtitle">
          Starts, completions & units under construction (coming soon)
        </p>
      </header>
      <p className="tab__status">
        Supply metrics from CMHC (starts, completions, under construction and
        permits) will be added in v1 once the ETL for those tables is ready.
      </p>
    </div>
  );
};
