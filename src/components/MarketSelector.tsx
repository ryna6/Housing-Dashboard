import React from "react";
import type { RegionCode } from "../data/types";

interface Props {
  value: RegionCode | null;
  onChange: (value: RegionCode | null) => void;
}

export const MarketSelector: React.FC<Props> = ({ value, onChange }) => {
  const isGta = value === "gta";
  const isVan = value === "metro_vancouver";

  return (
    <div className="market-selector">
      <span>Market:</span>
      <div className="market-selector__buttons">
        <button
          type="button"
          className={
            "market-selector__btn" +
            (isGta ? " market-selector__btn--active" : "")
          }
          onClick={() => onChange(isGta ? null : "gta")}
        >
          GTA
        </button>
        <button
          type="button"
          className={
            "market-selector__btn" +
            (isVan ? " market-selector__btn--active" : "")
          }
          onClick={() =>
            onChange(isVan ? null : ("metro_vancouver" as RegionCode))
          }
        >
          Metro Van
        </button>
      </div>
    </div>
  );
};
