import React, { useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
import { ChartPanel } from "../components/ChartPanel";

type FactorId =
  | "tightness"
  | "rates"
  | "household_credit"
  | "business_credit"
  | "construction"
  | "rental_stress"
  | "macro";

interface FactorSection {
  id: FactorId;
  title: string;
  description: string;
  howToRead: string[];
  chartTitle: string;
}

const EMPTY_SERIES: PanelPoint[] = [];

export const OverviewTab: React.FC = () => {
  const sections = useMemo<FactorSection[]>(
    () => [
      {
        id: "tightness",
        title: "Resale tightness",
        description:
          "Measures how balanced the resale market is (demand versus available supply).",
        howToRead: [
          "If SNLR rises and MOI falls, the market is tightening (typically supportive for price growth).",
          "If active listings rise while sales/new listings weaken, tightness is easing (downside risk grows).",
        ],
        chartTitle: "Factor: Resale tightness (placeholder)",
      },
      {
        id: "rates",
        title: "Rates & debt-service conditions",
        description:
          "Captures borrowing costs and the payment burden channel (rates are the main transmission mechanism in Canada).",
        howToRead: [
          "If yields/mortgage rates rise, affordability tightens and housing price growth usually slows with a lag.",
          "If rates fall while tightness is stable/improving, price momentum can re-accelerate.",
        ],
        chartTitle: "Factor: Rates & debt-service (placeholder)",
      },
      {
        id: "household_credit",
        title: "Household credit & leverage",
        description:
          "Captures the demand fuel side (mortgage growth, consumer leverage) that can amplify housing cycles.",
        howToRead: [
          "If household credit growth accelerates while rates are steady/easing, demand conditions are strengthening.",
          "If credit growth cools as rates rise, demand typically weakens before supply fully adjusts.",
        ],
        chartTitle: "Factor: Household credit & leverage (placeholder)",
      },
      {
        id: "business_credit",
        title: "Business / developer credit",
        description:
          "Captures funding conditions for builders and the supply pipeline (developer financing can stay elevated even as demand slows).",
        howToRead: [
          "If business credit remains strong while household credit cools, supply overshoot risk can increase.",
          "If business credit tightens alongside demand, pipeline growth may slow with a lag.",
        ],
        chartTitle: "Factor: Business / developer credit (placeholder)",
      },
      {
        id: "construction",
        title: "Construction pipeline & inventory",
        description:
          "Tracks supply arriving with long lags (starts/permits lead; completions/inventory follow).",
        howToRead: [
          "If starts/permits rise while resale tightness is already loosening, oversupply risk increases (with a lag).",
          "If completions remain elevated while absorption weakens, inventory pressure typically builds.",
        ],
        chartTitle: "Factor: Construction pipeline & inventory (placeholder)",
      },
      {
        id: "rental_stress",
        title: "Rental stress & affordability constraints",
        description:
          "Tracks when rents, vacancy, and affordability levels signal household stress or a constrained ownership/rental market.",
        howToRead: [
          "If vacancy falls and rents rise, rental stress is increasing.",
          "If rental stress is high and rates are also high, it can indicate broad affordability strain.",
        ],
        chartTitle: "Factor: Rental stress & affordability (placeholder)",
      },
      {
        id: "macro",
        title: "Macro backdrop",
        description:
          "Provides context from growth, liquidity, and risk appetite (typically secondary to rates/credit for housing timing).",
        howToRead: [
          "If growth/liquidity indicators improve alongside easing rates, housing conditions usually firm up.",
          "If risk assets roll over and growth slows, housing activity often weakens with a lag.",
        ],
        chartTitle: "Factor: Macro backdrop (placeholder)",
      },
    ],
    []
  );

  const [jumpTo, setJumpTo] = useState<FactorId | "">("");

  const handleJump = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value as FactorId | "";
    setJumpTo(id);
    if (!id) return;

    const el = document.getElementById(`factor-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="tab overview">
      <header className="tab__header">
        <h1 className="tab__title">Overview</h1>
        <p className="tab__subtitle">
          A factor-based navigation view. Each section provides a short definition,
          a quick reading guide, and a placeholder chart slot.
        </p>
      </header>

      <div className="tab__controls tab__controls--inline">
        <div className="tab__segment tab__segment--left">
          Jump to
          <select
            className="tab__regions-select"
            value={jumpTo}
            onChange={handleJump}
            aria-label="Jump to factor"
          >
            <option value="">Select a factor…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overview__sections">
        {sections.map((section) => (
          <section
            key={section.id}
            id={`factor-${section.id}`}
            className="overview__section"
          >
            <div className="overview__section-header">
              <h2 className="overview__section-title">{section.title}</h2>
            </div>

            <p className="overview__section-description">{section.description}</p>

            <div className="overview__howto">
              <div className="overview__howto-title">How to read</div>
              <ul className="overview__howto-list">
                {section.howToRead.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>

            <ChartPanel
              title={section.chartTitle}
              series={EMPTY_SERIES}
              valueKey="value"
            />
          </section>
        ))}
      </div>
    </div>
  );
};
