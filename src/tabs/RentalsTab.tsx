import React, { useMemo, useState } from "react";
import type { PanelPoint, RegionCode } from "../data/types";
import type { MetricSnapshot } from "../components/MetricSnapshotCard";
import { MetricSnapshotCard } from "../components/MetricSnapshotCard";
import { ChartPanel } from "../components/ChartPanel";
import { getLatestByMetric } from "../data/dataClient";
import { useTabData } from "./useTabData";

type CityCode = "toronto" | "vancouver" | "montreal" | "calgary";

// CHANGED: bedroom segment codes
type BedroomType = "bachelor" | "1bd" | "2bd";

const CITY_OPTIONS: { value: CityCode; label: string }[] = [
  { value: "toronto", label: "Toronto" },
  { value: "vancouver", label: "Vancouver" },
  { value: "montreal", label: "Montreal" },
  { value: "calgary", label: "Calgary" },
];

// CHANGED: values + labels
const BEDROOM_OPTIONS: { value: BedroomType; label: string }[] = [
  { value: "bachelor", label: "Bachelor" },
  { value: "1bd", label: "1 bedroom" },
  { value: "2bd", label: "2 bedroom" },
];

const CARD_TITLES: Record<string, string> = {
  rent_level: "Rent cost",
  rent_to_income: "Rent-to-income",
  price_to_rent: "Price-to-rent",
  rental_vacancy_rate: "Rental vacancy rate",
};

function trimLastYears(series: PanelPoint[], years: number): PanelPoint[] {
  if (series.length <= 1) return series;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setFullYear(cutoff.getFullYear() - years);

  return sorted.filter((p) => {
    const d = new Date(p.date);
    return d >= cutoff;
  });
}

function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatYears(value: number): string {
  return `${value.toFixed(1)} yrs`;
}

export const RentalsTab: React.FC = () => {
  const { data, loading, error } = useTabData("rentals");

  const [city, setCity] = useState<CityCode>("toronto");
  // CHANGED: default to "2bd"
  const [bedroom, setBedroom] = useState<BedroomType>("2bd");

  const handleCityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCity(event.target.value as CityCode);
  };

  const handleBedroomChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setBedroom(event.target.value as BedroomType);
  };

  const snapshots: MetricSnapshot[] = useMemo(() => {
    if (!data.length) return [];

    const region = city as unknown as RegionCode;
    const snaps: MetricSnapshot[] = [];

    // Rent level & rent-to-income (depend on bedroom type)
    snaps.push(
      ...getLatestByMetric(
        data,
        region,
        ["rent_level", "rent_to_income"],
        bedroom // CHANGED: bedroom now "bachelor" | "1bd" | "2bd"
      )
    );

    // Price-to-rent – always uses 2-bedroom rent
    snaps.push(
      ...getLatestByMetric(data, region, ["price_to_rent"], "2bd") // CHANGED: "2bd"
    );

    // Rental vacancy rate – city-level (segment "all")
    snaps.push(
      ...getLatestByMetric(
        data,
        region,
        ["rental_vacancy_rate"],
        "all"
      )
    );

    const byMetric = new Map<string, MetricSnapshot>();
    for (const snap of snaps) {
      if (!byMetric.has(snap.metric)) {
        byMetric.set(snap.metric, snap);
      }
    }

    const orderedMetrics = [
      "rent_level",
      "rent_to_income",
      "price_to_rent",
      "rental_vacancy_rate",
    ];

    return orderedMetrics
      .map((m) => byMetric.get(m))
      .filter((s): s is MetricSnapshot => !!s);
  }, [data, city, bedroom]);

  // CHANGED: filters now use "bachelor" | "1bd" | "2bd"
  const rentLevelSeries: PanelPoint[] = useMemo(
    () => {
      const region = city as unknown as RegionCode;
      return trimLastYears(
        data.filter(
          (p) =>
            p.metric === "rent_level" &&
            p.region === region &&
            p.segment === bedroom
        ),
        10
      );
    },
    [data, city, bedroom]
  );

  const rentToIncomeSeries: PanelPoint[] = useMemo(
    () => {
      const region = city as unknown as RegionCode;
      return trimLastYears(
        data.filter(
          (p) =>
            p.metric === "rent_to_income" &&
            p.region === region &&
            p.segment === bedroom
        ),
        10
      );
    },
    [data, city, bedroom]
  );

  const priceToRentSeries: PanelPoint[] = useMemo(
    () => {
      const region = city as unknown as RegionCode;
      return trimLastYears(
        data.filter(
          (p) =>
            p.metric === "price_to_rent" &&
            p.region === region &&
            p.segment === "2bd" // CHANGED
        ),
        10
      );
    },
    [data, city]
  );

  const vacancySeries: PanelPoint[] = useMemo(
    () => {
      const region = city as unknown as RegionCode;
      return trimLastYears(
        data.filter(
          (p) =>
            p.metric === "rental_vacancy_rate" &&
            p.region === region &&
            p.segment === "all"
        ),
        10
      );
    },
    [data, city]
  );

  const selectedCityLabel =
    CITY_OPTIONS.find((opt) => opt.value === city)?.label ?? city;

  const selectedBedroomLabel =
    BEDROOM_OPTIONS.find((opt) => opt.value === bedroom)?.label ?? bedroom;

  return (
    <div className="tab">
      <header className="tab__header">
        <h1 className="tab__title">Rentals</h1>
        <p className="tab__subtitle">
          Apartment rents, rent-to-income, price-to-rent ratios, and rental
          vacancy rates (Statistics Canada &amp; CMHC)
        </p>
      </header>

      <div className="tab__controls">
        <div className="tab__region">
          <span>City:</span>
          <select value={city} onChange={handleCityChange}>
            {CITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tab__segment">
          <span>Bedroom type:</span>
          <select value={bedroom} onChange={handleBedroomChange}>
            {BEDROOM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="tab__status">Loading rentals data…</div>
      )}
      {error && (
        <div className="tab__status tab__status--error">
          Failed to load rentals data: {error}
        </div>
      )}

      <section className="tab__metrics">
        {!loading && !error && !snapshots.length && (
          <div className="tab__status">
            No rentals data available for this selection yet.
          </div>
        )}
        {snapshots.map((snapshot) => (
          <MetricSnapshotCard
            key={snapshot.metric}
            snapshot={snapshot}
            titleOverride={CARD_TITLES[snapshot.metric] ?? undefined}
          />
        ))}
      </section>

      <section className="tab__charts">
        <ChartPanel
          title={`${selectedCityLabel} ${selectedBedroomLabel} rent`}
          series={rentLevelSeries}
          valueKey="value"
          valueFormatter={formatCompactCurrency}
          clampYMinToZero
        />
        <ChartPanel
          title={`${selectedCityLabel} ${selectedBedroomLabel} rent-to-income`}
          series={rentToIncomeSeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
        <ChartPanel
          title={`${selectedCityLabel} price-to-rent`}
          series={priceToRentSeries}
          valueKey="value"
          valueFormatter={formatYears}
          clampYMinToZero
        />
        <ChartPanel
          title={`${selectedCityLabel} rental vacancy rate`}
          series={vacancySeries}
          valueKey="value"
          treatAsPercentScale
          clampYMinToZero
        />
      </section>
    </div>
  );
};
