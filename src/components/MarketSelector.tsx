import React from "react";
import type { MarketCode } from "../data/types";

const MARKETS: MarketCode[] = ["canada", "on", "bc"];

const MARKET_LABELS: Record<MarketCode, string> = {
  canada: "Canada",
  on: "Ontario",
  bc: "British Columbia"
};

interface Props {
  value: MarketCode;
  onChange: (value: MarketCode) => void;
}

export const MarketSelector: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="market-selector">
      <span>Market:</span>
      <div className="market-selector__buttons">
        {MARKETS.map((mkt) => (
          <button
            key={mkt}
            type="button"
            className={
              "market-selector__btn" +
              (value === mkt ? " market-selector__btn--active" : "")
            }
            onClick={() => onChange(mkt)}
          >
            {MARKET_LABELS[mkt]}
          </button>
        ))}
      </div>
    </div>
  );
};
