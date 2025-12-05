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
    "Supply pipeline indicators (e.g., starts, completions, under construction, construction investment) that arrive with long lags and shape future balance.",
  rates:
    "Borrowing cost and yield context (policy rate, mortgage rate, GoC yields) that drives affordability and demand through the rate channel.",
  inflation:
    "Inflation and labour context (CPI, wage, employment) for the broader macro environment affecting housing conditions.",
  credit:
    "Household and business credit aggregates that proxy demand fuel and funding conditions.",
  market:
    "Macro/liquidity context (e.g., GDP, stock market, money supply) to contextualize broader cycle conditions.",
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
          "SNLR ↑ and MOI ↓ = resale market tightening (usually supports price growth).",
          "Active listings ↑ while sales / new listings ↓ = tightness easing and downside risk ↑.",
        ],
        chartTitle: "Factor: Resale Tightness (placeholder)",
      },
      {
        id: "rates",
        title: "Rates & Debt-Service Conditions",
        description:
          "Captures borrowing costs and the payment burden channel (rates are the main transmission mechanism in Canada).",
        howToRead: [
          "Yields / mortgage rates ↑ = affordability ↓ and HPI growth tends to slow (with a lag).",
          "Rates ↓ while resale tightness is stable or ↑ = price momentum can re-accelerate.",
        ],
        chartTitle: "Factor: Rates & debt-service (placeholder)",
      },
      {
        id: "household_credit",
        title: "Household Credit & Leverage",
        description:
          "Captures the demand-fuel side (mortgage growth, consumer leverage) that can amplify housing cycles.",
        howToRead: [
          "Household credit growth ↑ with flat or ↓ rates = demand conditions strengthening.",
          "Household credit growth ↓ while rates ↑ = demand typically weakens before supply adjusts.",
        ],
        chartTitle: "Factor: Household credit & leverage (placeholder)",
      },
      {
        id: "business_credit",
        title: "Business & Corporate Credit",
        description:
          "Captures funding conditions for builders and the supply pipeline (developer financing can stay elevated even as demand slows).",
        howToRead: [
          "Business / developer credit ↑ while household credit ↓ = supply overshoot risk ↑.",
          "Business / developer credit ↓ alongside demand ↓ = pipeline growth likely slows.",
        ],
        chartTitle: "Factor: Business / corporate credit (placeholder)",
      },
      {
        id: "construction",
        title: "Supply Pipeline & Inventory",
        description:
          "Tracks supply arriving with long lags (starts/permits lead; completions/inventory follow).",
        howToRead: [
          "Starts / permits ↑ while resale tightness ↓ = future oversupply risk ↑.",
          "Completions ↑ and absorption ↓ = inventory pressure ↑.",
        ],
        chartTitle: "Factor: Construction pipeline & inventory (placeholder)",
      },
      {
        id: "rental_stress",
        title: "Rental Stress & Affordability",
        description:
          "Tracks when rents, vacancy, and affordability levels signal household stress or a constrained ownership/rental market.",
        howToRead: [
          "Vacancy ↓ and rents ↑ → rental stress ↑.",
          "Rental stress ↑ while r=tes ↑ and ownership affordability ↓ = broad affordability strain ↑.",
        ],
        chartTitle: "Factor: Rental stress & affordability (placeholder)",
      },
      {
        id: "macro",
        title: "Macro Backdrop",
        description:
          "Provides context from growth, liquidity, and risk appetite (typically secondary to rates/credit for housing timing).",
        howToRead: [
          "Growth / liquidity ↑ and rates ↓ = housing conditions often firm up.",
          "Risk appetite ↓ and growth ↓ = housing activity often weakens (with a lag).",
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
              series={EMPTY_SERIES}
              valueKey="value"
            />
          </section>
        </div>
      )}
    </div>
  );
};
