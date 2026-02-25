import { divIcon } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Property } from "../types/property";

type PropertiesMapProps = {
  properties: Property[];
  selectedPropertyId: number | null;
  onSelectProperty: (id: number) => void;
};

const defaultCenter: [number, number] = [38.15, 23.75];

function formatCompactPrice(price: number): string {
  if (price >= 1_000_000) return `EUR ${(price / 1_000_000).toFixed(1)}M`;
  return `EUR ${Math.round(price / 1000)}K`;
}

function createMarkerIcon(price: number, selected: boolean) {
  return divIcon({
    className: "map-price-icon-wrapper",
    html: `<span class="map-price-icon${selected ? " is-selected" : ""}">${formatCompactPrice(
      price
    )}</span>`,
    iconSize: [74, 28],
    iconAnchor: [37, 14],
  });
}

function MapViewportController({
  properties,
  selectedPropertyId,
}: {
  properties: Property[];
  selectedPropertyId: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  useEffect(() => {
    if (properties.length === 0) {
      map.setView(defaultCenter, 6);
      return;
    }

    const selected = properties.find((property) => property.id === selectedPropertyId);
    if (selected) {
      map.flyTo([selected.lat, selected.lng], 12, { duration: 0.6 });
      return;
    }

    if (properties.length === 1) {
      map.setView([properties[0].lat, properties[0].lng], 12);
      return;
    }

    const bounds = properties.map((property) => [property.lat, property.lng] as [number, number]);
    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 8,
    });
  }, [map, properties, selectedPropertyId]);

  return null;
}

export function PropertiesMap({
  properties,
  selectedPropertyId,
  onSelectProperty,
}: PropertiesMapProps) {
  if (properties.length === 0) {
    return (
      <div className="map-placeholder map-placeholder--loading">
        No listings match the active filters.
      </div>
    );
  }

  return (
    <MapContainer center={defaultCenter} zoom={6} scrollWheelZoom className="leaflet-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      <MapViewportController
        properties={properties}
        selectedPropertyId={selectedPropertyId}
      />

      {properties.map((property) => (
        <Marker
          key={property.id}
          position={[property.lat, property.lng]}
          icon={createMarkerIcon(property.price, property.id === selectedPropertyId)}
          eventHandlers={{ click: () => onSelectProperty(property.id) }}
        >
          <Popup>
            <strong>{property.title}</strong>
            <br />
            {property.address}
            <br />
            {property.area}
            <br />
            EUR {property.price.toLocaleString()} | {property.sqm} sqm
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
