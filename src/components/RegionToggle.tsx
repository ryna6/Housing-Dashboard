import React from "react";
import type { RegionCode } from "../data/types";

const REGION_LABELS: Record<RegionCode, string> = {
  canada: "Canada",
  on: "Ontario",
  bc: "British Columbia",
  gta: "Toronto (GTA)",
  metro_vancouver: "Metro Vancouver",
};

interface Props {
  value: RegionCode;
  onChange: (value: RegionCode) => void;
  allowedRegions: RegionCode[];   // e.g. ["canada","on","bc"]
  disabledRegions?: RegionCode[]; // for metrics that are national only
  note?: string;
}

export const RegionToggle: React.FC<Props> = ({
  value,
  onChange,
  allowedRegions,
  disabledRegions = [],
  note,
}) => {
  return (
    <div className="region-toggle">
      {allowedRegions.map(region => {
        const disabled = disabledRegions.includes(region);
        return (
          <button
            key={region}
            disabled={disabled}
            className={
              "region-toggle__btn" +
              (value === region ? " region-toggle__btn--active" : "") +
              (disabled ? " region-toggle__btn--disabled" : "")
            }
            onClick={() => !disabled && onChange(region)}
          >
            {REGION_LABELS[region]}
          </button>
        );
      })}
      {note && <div className="region-toggle__note">{note}</div>}
    </div>
  );
};

