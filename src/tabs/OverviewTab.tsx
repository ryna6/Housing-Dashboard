import React, { useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
import { ChartPanel } from "../components/ChartPanel";
import { TABS } from "./tabConfig";

type FactorId =
  | "tightness"
  | "rates"
  | "household_credit"
  | "business_credit"
  | "construction"
  | "rental_stress"
  | "macro";

type OverviewView = "main" | FactorId;

interface FactorSection {
  id: FactorId;
  title: string;
  description: string;
  howToRead: string[];
  chartTitle: string;
}

const EMPTY_SERIES: PanelPoint[] = [];

const TAB_DESCRIPTIONS: Record<string, string> = {
  prices:
    "Home prices and valuation context (e.g., HPI, average price) to understand the direction and magnitude of price moves.",
  sales:
    "Resale activity and market balance signals (e.g., sales, new listings, SNLR, MOI) that often lead price turning points.",
  supply:
    "Supply pipeline indicators (e.g., starts, completions, under construction) that arrive with long lags and shape future balance.",
  rates:
    "Borrowing cost and yield context (policy rate, mortgage rate, GoC yields) that drives affordability and demand through the rate channel.",
  inflation:
    "Inflation and labour context (CPI, employment) for the broader macro environment affecting housing conditions.",
  credit:
    "Household and business credit aggregates that proxy demand fuel and funding conditions.",
  market:
    "Macro/liquidity context (e.g., GDP, money/liquidity proxies) to contextualize broader cycle conditions.",
  rentals:
    "Rental market conditions (e.g., rent costs, affordability ratios, vacancy) capturing renter stress and substitution dynamics.",
};

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
          "Captures the demand-fuel side (mortgage growth, consumer leverage) that can amplify housing cycles.",
        howToRead: [
          "If household credit accelerates while rates are steady/easing, demand conditions are strengthening.",
          "If credit cools while rates rise, demand typically weakens before supply fully adjusts.",
        ],
        chartTitle: "Factor: Household credit & leverage (placeholder)",
      },
      {
        id: "business_credit",
        title: "Business / developer credit",
        description:
          "Captures funding conditions for builders and the supply pipeline (developer financing can stay elevated even as demand slows).",
        howToRead: [
          "If business credit stays strong while household credit cools, supply overshoot risk can increase.",
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
          "If the pipeline rises while resale tightness is already loosening, oversupply risk increases (with a lag).",
          "If completions stay elevated while absorption weakens, inventory pressure typically builds.",
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
          "If growth/liquidity improves alongside easing rates, housing conditions often firm up.",
          "If risk appetite rolls over and growth slows, housing activity often weakens with a lag.",
        ],
        chartTitle: "Factor: Macro backdrop (placeholder)",
      },
    ],
    []
  );

  const [view, setView] = useState<OverviewView>("main");

  const selectedFactor = useMemo(() => {
    if (view === "main") return null;
    return sections.find((s) => s.id === view) ?? null;
  }, [sections, view]);

  const handleSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setView(event.target.value as OverviewView);
  };

  return (
    <div className="tab overview">
      <header className="tab__header">
        <h1 className="tab__title">Overview</h1>
      </header>

      {view === "main" && (
        <div className="overview__main">
          <section className="overview__hero">
            <h2 className="overview__hero-title">What this dashboard does</h2>
            <p className="overview__hero-text">
              This site organizes Canadian housing drivers into a set of tabs and
              a factor framework. Use the tabs for raw indicators, and use the
              factor selector above to view a single “driver” with interpretation
              guidance.
            </p>
          </section>

      <div className="tab__controls tab__controls--inline">
        <div className="tab__segment tab__segment--left">
          View
          <select
            className="tab__regions-select"
            value={view}
            onChange={handleSelect}
            aria-label="Select overview view"
          >
            <option value="main">Main Overview</option>
            <optgroup label="Factors">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>
          
          <section className="overview__tabgrid">
            <h3 className="overview__section-title">Tabs at a glance</h3>
            <div className="overview__tabgrid-inner">
              {TABS.map((t) => (
                <div key={t.key} className="overview__tabcard">
                  <div className="overview__tabcard-top">
                    <div className="overview__tabicon">{t.icon}</div>
                    <div className="overview__tabname">{t.label}</div>
                  </div>
                  <div className="overview__tabdesc">
                    {TAB_DESCRIPTIONS[t.key] ?? "Description coming soon."}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overview__next">
            <h3 className="overview__section-title">Next step</h3>
            <p className="overview__hero-text">
              Choose a factor from the selector above to see: (1) what it is,
              (2) how to interpret it, and (3) a chart placeholder.
            </p>
          </section>
        </div>
      )}

      {selectedFactor && (
        <div className="overview__single">
          <section className="overview__section">
            <div className="overview__section-header">
              <h2 className="overview__section-title">{selectedFactor.title}</h2>
            </div>

            <p className="overview__section-description">
              {selectedFactor.description}
            </p>

            <div className="overview__howto">
              <div className="overview__howto-title">How to read</div>
              <ul className="overview__howto-list">
                {selectedFactor.howToRead.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>

            <ChartPanel
              title={selectedFactor.chartTitle}
              series={EMPTY_SERIES}
              valueKey="value"
            />
          </section>
        </div>
      )}
    </div>
  );
};
