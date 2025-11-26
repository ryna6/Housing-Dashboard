import React from "react";
import type { RegionCode } from "../data/types";

interface Props {
  value: RegionCode | null;
  onChange: (value: RegionCode | null) => void;
}

export const MarketSelector: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="market-selector">
      <span className="market-selector__label">Market:</span>
      <button
        className={
          "market-selector__btn" +
          (value === null ? " market-selector__btn--active" : "")
        }
        onClick={() => onChange(null)}
      >
        Province-level
      </button>
      <button
        className={
          "market-selector__btn" +
          (value === "gta" ? " market-selector__btn--active" : "")
        }
        onClick={() => onChange("gta")}
      >
        Toronto / GTA
      </button>
      <button
        className={
          "market-selector__btn" +
          (value === "metro_vancouver" ? " market-selector__btn--active" : "")
        }
        onClick={() => onChange("metro_vancouver")}
      >
        Metro Vancouver
      </button>
    </div>
  );
};
