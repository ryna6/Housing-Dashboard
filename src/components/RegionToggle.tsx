import React from "react";
import type { RegionCode } from "../data/types";

const REGION_LABELS: Record<RegionCode, string> = {
  canada: "Canada",
  on: "Ontario",
  bc: "British Columbia",
  gta: "GTA",
  metro_vancouver: "Metro Van"
};

interface Props {
  value: RegionCode;
  onChange: (region: RegionCode) => void;
  allowedRegions?: RegionCode[];
}

export const RegionToggle: React.FC<Props> = ({
  value,
  onChange,
  allowedRegions
}) => {
  const regions: RegionCode[] =
    allowedRegions && allowedRegions.length > 0
      ? allowedRegions
      : ["canada", "on", "bc", "gta", "metro_vancouver"];

  return (
    <div className="region-toggle" role="radiogroup" aria-label="Region">
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
            onClick={() => onChange(code)}
          >
            {REGION_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
};
