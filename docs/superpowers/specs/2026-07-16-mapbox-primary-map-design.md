# Mapbox Primary Map Integration Design

Date: 2026-07-16
Status: Approved direction, pending written-spec review

## Objective

Make the Mapbox globe the application's single primary map on desktop and mobile. Remove the separate Globe navigation choice and render uploaded Sandbox clusters and Real Estate properties directly on the same Mapbox instance.

## Current State

The frontend currently owns two independent map renderers:

- `GlobeMapExperience` and `useMapboxMap` provide the Mapbox globe, place search, result markers, and camera interactions.
- `ClusterMap` provides the operational Sandbox and Real Estate map through MapLibre and deck.gl.
- `App` switches between the two experiences with `showGlobeMap` and a Globe tab.

This split prevents uploaded datasets from appearing on the Mapbox globe and duplicates camera, interaction, styling, and lifecycle behavior.

## Selected Approach

Use one native Mapbox GL renderer for the base map and all overlays. `App` remains the owner of upload, analytics, filtering, selection, and mode state. `GlobeMapExperience` becomes the persistent map surface and receives operational data and callbacks as props.

The old MapLibre/deck.gl `ClusterMap` is removed from the runtime path after equivalent Mapbox layers are verified. Its data encodings and user interactions are preserved where they remain useful.

## Application Composition

`App` will always render one full-screen application shell:

1. The Mapbox map fills the viewport as the base layer.
2. The operational header is rendered above it.
3. The header contains only the `Sandbox` and `Real Estate` modes.
4. Upload, filters, analytics, listings, and KPI panels remain controlled by `App`.
5. Place search and its result carousel remain attached to the Mapbox map.
6. The Globe tab, `showGlobeMap` branch, and globe back button are removed.

The existing backend endpoints and response contracts remain unchanged.

## Data Flow

### Sandbox

1. The user selects or drops a CSV file in Upload & Setup.
2. `App` posts the file to `/api/geo/upload?radiusMeters=...`.
3. The existing normalized cluster objects remain the frontend contract.
4. `App` passes clusters, outlier IDs, selection, and focus callbacks to the Mapbox experience.
5. The Mapbox hook converts clusters into a dedicated GeoJSON source.
6. Source data is updated in place when upload results, radius, outliers, or selection change.

Each backend cluster is already aggregated, so Mapbox must not cluster these records a second time.

### Real Estate

1. The user selects or drops a Real Estate CSV file.
2. `App` posts the file to `/api/realestate/upload`.
3. Filters continue to produce `visibleProperties` in `App`.
4. Each visible property becomes one GeoJSON point in a separate Mapbox source.
5. Selection updates the map styling and the existing listing/KPI panel.

### Place Search

Mapbox place-search results keep their own source, layers, and marker lifecycle. Search data and uploaded operational data use distinct source and layer IDs so either can update without deleting the other.

## Visual Encoding

### Sandbox Clusters

- Position: centroid longitude and latitude.
- Circle size: scaled by `pointCount` with bounded minimum and maximum radii.
- Circle color: green to yellow to red, normalized from the visible clusters' `averageValue` range.
- Label: abbreviated `pointCount` for clusters with enough visual space.
- Outlier: amber or high-contrast stroke.
- Selected cluster: stronger stroke and raised visual emphasis.
- Hover: cluster count, average value, centroid, and outlier status.
- Click/tap: select the cluster and synchronize the analytics panel.

### Real Estate Properties

- Position: property longitude and latitude.
- Circle color: continuous price encoding calculated from visible properties.
- Outlier: red treatment that remains distinguishable from the price scale.
- Selected property: larger radius and high-contrast stroke.
- Hover: title, price, size, unit price, address, and outlier status.
- Click/tap: select the property and synchronize the listing panel.

All encodings will include stable fallbacks when every visible value is equal or when only one item exists.

## Camera Behavior

- The initial state remains the rotating low-zoom Mapbox globe.
- User mouse, touch, wheel, pitch, and rotation behavior remains unchanged.
- A successful upload fits the camera to the uploaded data with padding for the header and lower search controls.
- A single uploaded feature uses `flyTo` rather than a zero-area bounds fit.
- Sandbox cluster selection and Real Estate listing selection focus the corresponding feature.
- Real Estate filter changes fit only when the visible geographic result set materially changes, avoiding camera jumps during simple selection.
- Automatic globe rotation pauses during user interaction, camera transitions, and focused data views.

## Map Lifecycle

Operational sources and layers are installed after the Mapbox style is ready. They are reinstalled after `style.load`, including theme-driven day/night style changes.

Layer ownership will be separated into small lifecycle helpers:

- place-search layers,
- Sandbox cluster layers,
- Real Estate property layers,
- hover and selection interactions.

Every helper must tolerate empty data, repeated calls, style reloads, and component cleanup without duplicate handlers or Mapbox source/layer errors.

## Responsive Behavior

### Desktop

- Keep the full operational header over the map.
- Keep Upload/Filters and Analytics/KPI panels anchored below their triggers.
- Keep Mapbox search and results near the lower viewport edge.

### Mobile

- Use a compact header with the two modes and icon-first action controls.
- Allow labels to wrap or hide at narrow widths without resizing the map canvas.
- Present operational panels within the viewport with bounded height and internal scrolling.
- Give an open upload, filter, or analytics panel priority over the bottom search controls to prevent overlap.
- Preserve touch drag, pinch zoom, tap selection, and safe-area padding.

## Empty, Loading, and Error States

- Before upload, the main Mapbox globe remains interactive.
- Upload progress remains visible in the existing setup panel.
- Invalid CSV and backend errors remain attached to the relevant upload flow.
- Empty filtered Real Estate results clear only the property source, not the map or search results.
- Missing token and WebGL errors retain an accessible blocking message.
- Layer update errors must not replace a successfully loaded base map.

## Testing Strategy

Unit and component tests will cover:

- the application no longer exposes a Globe tab or back navigation,
- Sandbox upload data is converted to the expected GeoJSON,
- backend clusters are not clustered a second time,
- Real Estate filters update the property source,
- selection and outlier styling properties are preserved,
- data layers survive Mapbox style reloads,
- fit bounds and single-feature focus behavior,
- empty data and cleanup without duplicate sources, layers, or listeners.

Browser verification will cover desktop and mobile viewports:

- one Mapbox canvas is present,
- globe drag, rotation, wheel zoom, and touch interactions work,
- CSV drag-and-drop renders data on the same map,
- Sandbox and Real Estate mode changes replace only the operational overlay,
- panels and search controls do not overlap,
- uploaded features can be selected by mouse and touch,
- no console, WebGL, source, or layer errors occur.

## Scope Boundaries

Included:

- one primary Mapbox renderer,
- removal of Globe navigation,
- native Mapbox layers for current Sandbox clusters and Real Estate properties,
- existing search, upload, filtering, analytics, selection, theme, and responsive behavior,
- focused tests and browser QA.

Not included:

- backend CSV contract changes,
- raw Sandbox point visualization because the backend currently returns clusters,
- new analytics algorithms,
- deployment infrastructure changes,
- replacement of Mapbox search or its API contract.

## Acceptance Criteria

The work is complete when the live application opens directly on the Mapbox map, contains no Globe choice, and visualizes both Sandbox clusters and individual Real Estate properties on that same map after upload. All existing operational panels remain usable on desktop and mobile, interaction regressions are absent, automated checks pass, and live browser verification produces no relevant errors.
