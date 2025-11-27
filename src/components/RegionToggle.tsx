import React from "react";
import type { MarketCode, RegionCode } from "../data/types";
import { REGIONS_BY_MARKET, REGION_LABELS } from "../data/regions";

interface Props {
  market: MarketCode;
  value: RegionCode | null;
  onChange: (region: RegionCode | null) => void;
}

export const RegionToggle: React.FC<Props> = ({
  market,
  value,
  onChange
}) => {
  const regions = REGIONS_BY_MARKET[market];

  // Canada has no sub-regions to choose from in the UI
  if (!regions || regions.length === 0) return null;

  return (
    <div className="region-toggle" role="radiogroup" aria-label="Regions">
      {regions.map((code) => {
        const isActive = code === value;
        return (
          <button
            key={code}
            type="button"
            className={
              "region-toggle__btn" +
              (isActive ? " region-toggle__btn--active" : "")
            }
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(isActive ? null : code)}
          >
            {REGION_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
};
