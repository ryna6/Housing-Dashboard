import React, { useMemo, useState } from "react";
import type { PanelPoint } from "../data/types";
import { ChartPanel } from "../components/ChartPanel";
import { TABS, TabKey } from "./tabConfig";

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

interface OverviewTabProps {
  onNavigateTab?: (tab: TabKey) => void;
}

const EMPTY_SERIES: PanelPoint[] = [];

const TAB_DESCRIPTIONS: Record<TabKey, string> = {
  overview:
    "A guided entry point: what each factor means, how to interpret it, and a quick way to jump between the system drivers.",
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

export const OverviewTab: React.FC<OverviewTabProps> = ({ onNavigateTab }) => {
  const sections = useMemo<FactorSection[]>(
    () => [
      {
        id: "tightness",
        title: "Resale Tightness",
        description:
          "Measures how balanced the resale market is (demand versus available supply).",
        howToRead: [
          "If SNLR rises and MOI falls, the market is tightening (typically supportive for price growth).",
          "If active listings rise while sales/new listings weaken, tightness is easing (downside risk grows).",
        ],
        chartTitle: "Factor: Resale Tightness (placeholder)",
      },
      {
        id: "rates",
        title: "Rates & Debt-Service Conditions",
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
        title: "Household Credit & Leverage",
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
        title: "Business & Corporate Credit",
        description:
          "Captures funding conditions for builders and the supply pipeline (developer financing can stay elevated even as demand slows).",
        howToRead: [
          "If business credit stays strong while household credit cools, supply overshoot risk can increase.",
          "If business credit tightens alongside demand, pipeline growth may slow with a lag.",
        ],
        chartTitle: "Factor: Business / corporate credit (placeholder)",
      },
      {
        id: "construction",
        title: "Supply Pipeline & Inventory",
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
        title: "Rental Stress & Affordability",
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
        title: "Macro Backdrop",
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

  const handleTabCardClick = (key: TabKey) => {
    if (onNavigateTab) {
      onNavigateTab(key);
    }
  };

  return (
    <div className="tab overview">
      <header className="tab__header">
        <h1 className="tab__title">Overview</h1>
        <p className="tab__subtitle">
          A guided entry point for the dashboard. Use the selector to view one
          factor at a time.
        </p>
      </header>

      {/* Dropdown stays visible for both main and factor views */}
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

      {view === "main" && (
        <div className="overview__main">
          <section className="overview__tabgrid">
            <h3 className="overview__section-title">Tabs at a glance</h3>
            <div className="overview__tabgrid-inner">
              {TABS.filter((t) => t.key !== "overview").map((t) => (
                <div
                  key={t.key}
                  className="overview__tabcard"
                  role={onNavigateTab ? "button" : undefined}
                  tabIndex={onNavigateTab ? 0 : -1}
                  onClick={() => handleTabCardClick(t.key)}
                  onKeyDown={(e) => {
                    if (!onNavigateTab) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleTabCardClick(t.key);
                    }
                  }}
                >
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
