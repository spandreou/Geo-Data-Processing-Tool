import { useEffect, useMemo, useState } from "react";
import { fetchProperties, getAreaOptions } from "../services/mockPropertiesApi";
import type { Property, PropertyFilters } from "../types/property";
import { PriceTrendChart } from "./PriceTrendChart";
import { PropertiesMap } from "./PropertiesMap";

type FilterDraft = {
  area: string;
  minPrice: string;
  maxPrice: string;
  minSqm: string;
  maxSqm: string;
};

const areas = getAreaOptions();

const initialDraft: FilterDraft = {
  area: "All Areas",
  minPrice: "",
  maxPrice: "",
  minSqm: "",
  maxSqm: "",
};

function toNumberOrUndefined(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function matchesSearch(property: Property, query: string): boolean {
  if (!query) return true;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    property.title.toLowerCase().includes(normalized) ||
    property.area.toLowerCase().includes(normalized) ||
    property.address.toLowerCase().includes(normalized)
  );
}

export function DashboardShell() {
  const [draft, setDraft] = useState<FilterDraft>(initialDraft);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<PropertyFilters>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchProperties(appliedFilters)
      .then((result) => {
        if (!cancelled) {
          setProperties(result);
          setSelectedPropertyId(result[0]?.id ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedFilters]);

  const visibleProperties = useMemo(
    () => properties.filter((property) => matchesSearch(property, searchTerm)),
    [properties, searchTerm]
  );

  useEffect(() => {
    if (visibleProperties.length === 0) {
      setSelectedPropertyId(null);
      return;
    }

    if (!visibleProperties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(visibleProperties[0].id);
    }
  }, [visibleProperties, selectedPropertyId]);

  const metrics = useMemo(() => {
    if (visibleProperties.length === 0) {
      return [
        { label: "Average Price", value: "EUR 0" },
        { label: "Average EUR/sqm", value: "EUR 0" },
        { label: "Properties", value: "0" },
        { label: "Outliers", value: "0" },
      ];
    }

    const totalPrice = visibleProperties.reduce((acc, item) => acc + item.price, 0);
    const totalPricePerSqm = visibleProperties.reduce(
      (acc, item) => acc + item.price / item.sqm,
      0
    );
    const outliers = visibleProperties.filter((item) => item.isOutlier).length;

    return [
      {
        label: "Average Price",
        value: `EUR ${Math.round(totalPrice / visibleProperties.length).toLocaleString()}`,
      },
      {
        label: "Average EUR/sqm",
        value: `EUR ${Math.round(totalPricePerSqm / visibleProperties.length).toLocaleString()}`,
      },
      { label: "Properties", value: visibleProperties.length.toString() },
      { label: "Outliers", value: outliers.toString() },
    ];
  }, [visibleProperties]);

  function handleApplyFilters() {
    setAppliedFilters({
      area: draft.area,
      minPrice: toNumberOrUndefined(draft.minPrice),
      maxPrice: toNumberOrUndefined(draft.maxPrice),
      minSqm: toNumberOrUndefined(draft.minSqm),
      maxSqm: toNumberOrUndefined(draft.maxSqm),
    });
  }

  return (
    <main className="dashboard">
      <section className="panel panel--filters">
        <h1>Real Estate Analytics Map</h1>
        <p>Interactive map, SQL-backed insights, and pricing trends.</p>

        <div className="filters-grid">
          <label>
            Area
            <select
              value={draft.area}
              onChange={(e) => setDraft((prev) => ({ ...prev, area: e.target.value }))}
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>

          <label>
            Min Price
            <input
              type="number"
              placeholder="100000"
              value={draft.minPrice}
              onChange={(e) => setDraft((prev) => ({ ...prev, minPrice: e.target.value }))}
            />
          </label>

          <label>
            Max Price
            <input
              type="number"
              placeholder="500000"
              value={draft.maxPrice}
              onChange={(e) => setDraft((prev) => ({ ...prev, maxPrice: e.target.value }))}
            />
          </label>

          <label>
            Min sqm
            <input
              type="number"
              placeholder="40"
              value={draft.minSqm}
              onChange={(e) => setDraft((prev) => ({ ...prev, minSqm: e.target.value }))}
            />
          </label>

          <label>
            Max sqm
            <input
              type="number"
              placeholder="160"
              value={draft.maxSqm}
              onChange={(e) => setDraft((prev) => ({ ...prev, maxSqm: e.target.value }))}
            />
          </label>

          <button type="button" onClick={handleApplyFilters} disabled={isLoading}>
            {isLoading ? "Applying..." : "Apply Filters"}
          </button>
        </div>
      </section>

      <section className="panel panel--map">
        <div className="panel-title">
          <h2>Map Directory</h2>
          <span>{visibleProperties.length} results</span>
        </div>

        <div className="map-workspace">
          <aside className="map-sidebar">
            <div className="map-sidebar__top">
              <input
                type="search"
                className="map-sidebar__search"
                placeholder="Search title, area or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="map-list">
              {visibleProperties.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  className={`map-list-item${
                    selectedPropertyId === property.id ? " is-active" : ""
                  }`}
                  onClick={() => setSelectedPropertyId(property.id)}
                >
                  <div className="map-list-item__header">
                    <strong>{property.title}</strong>
                    {property.isOutlier ? <span>Outlier</span> : null}
                  </div>
                  <p>{property.address}</p>
                  <small>{property.area}</small>
                  <div className="map-list-item__metrics">
                    <b>EUR {property.price.toLocaleString()}</b>
                    <span>{property.sqm} sqm</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="map-canvas-wrap">
            <PropertiesMap
              properties={visibleProperties}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={setSelectedPropertyId}
            />
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article className="panel metric-card" key={metric.label}>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel panel--trend">
        <div className="panel-title">
          <h2>Price Trend</h2>
          <span>Last 12 months</span>
        </div>
        <PriceTrendChart properties={visibleProperties} />
      </section>
    </main>
  );
}
