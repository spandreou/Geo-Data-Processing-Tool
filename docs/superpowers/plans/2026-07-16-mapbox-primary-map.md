# Mapbox Primary Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split Mapbox and MapLibre experiences with one primary Mapbox globe that visualizes uploaded Sandbox clusters and individual Real Estate properties.

**Architecture:** `App` remains responsible for upload, filters, analytics, selection, and panel state. `GlobeMapExperience` becomes the permanent map surface and delegates operational GeoJSON source/layer ownership to a focused `useMapboxOperationalLayers` hook. Pure conversion helpers provide testable GeoJSON and bounds behavior without Mapbox mocks.

**Tech Stack:** React 19, TypeScript/JSX, Mapbox GL JS 3.26, Vite 7, Tailwind CSS, Vitest, Testing Library, Playwright/browser QA.

## Global Constraints

- Render exactly one Mapbox canvas and no runtime MapLibre/deck.gl map.
- Remove the Globe tab and back button; keep only Sandbox and Real Estate modes.
- Preserve existing backend endpoints and payload contracts.
- Sandbox data remains backend-produced clusters and must not be clustered a second time.
- Real Estate data renders one feature per visible property.
- Preserve place search, drag, wheel, touch, rotation, upload, filters, analytics, selection, and theme behavior.
- Prevent operational panels and Mapbox search controls from overlapping on mobile.
- Preserve all pre-existing worktree changes and do not create commits from mixed user-owned files.

---

### Task 1: Operational GeoJSON Contracts

**Files:**
- Modify: `frontend/src/types/mapTypes.ts`
- Create: `frontend/src/utils/operationalMapUtils.ts`
- Create: `frontend/src/utils/operationalMapUtils.test.ts`

**Interfaces:**
- Produces: `MapViewMode`, `SandboxCluster`, `RealEstateProperty`, `createClusterFeatureCollection`, `createPropertyFeatureCollection`, `getOperationalCoordinates`.
- Consumes: Existing normalized cluster and property field names from `App.jsx` and backend JSON.

- [ ] **Step 1: Write failing conversion tests**

Test that clusters become point features with `pointCount`, `averageValue`, `isOutlier`, and `isSelected`; properties become one point each with safe numeric coordinates; invalid coordinates are excluded; and `getOperationalCoordinates` returns only the active mode's coordinates.

```ts
expect(createClusterFeatureCollection(clusters, ['cluster-2'], 'cluster-1').features[0]).toMatchObject({
  geometry: { type: 'Point', coordinates: [23.72, 37.98] },
  properties: { id: 'cluster-1', pointCount: 8, isSelected: true, isOutlier: false },
})
expect(createPropertyFeatureCollection(properties, 7).features).toHaveLength(properties.length)
expect(getOperationalCoordinates('market', clusters, properties)).toEqual([[23.73, 37.99]])
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- operationalMapUtils.test.ts`

Expected: FAIL because `operationalMapUtils.ts` and its exports do not exist.

- [ ] **Step 3: Add exact shared types**

```ts
export type MapViewMode = 'sandbox' | 'market'

export interface SandboxCluster {
  id: string
  centroidLatitude: number
  centroidLongitude: number
  pointCount: number
  averageValue: number
}

export interface RealEstateProperty {
  id: number
  title: string
  area: string
  address: string
  price: number
  sqm: number
  lat: number
  lng: number
  createdAt: string
  isOutlier: boolean
}
```

- [ ] **Step 4: Implement pure GeoJSON helpers**

Use `GeoJSON.FeatureCollection<GeoJSON.Point, ...>` return types. Set `isSelected` and `isOutlier` as booleans in feature properties. Filter non-finite coordinates and do not add Mapbox source-level clustering.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- operationalMapUtils.test.ts`

Expected: all operational utility tests pass.

---

### Task 2: Native Mapbox Operational Layers

**Files:**
- Create: `frontend/src/hooks/useMapboxOperationalLayers.ts`
- Modify: `frontend/src/hooks/useMapboxMap.ts`
- Modify: `frontend/src/types/mapTypes.ts`
- Modify: `frontend/src/components/GlobeMapExperience.test.tsx`

**Interfaces:**
- Consumes: `mapRef`, `isReady`, `viewMode`, `clusters`, `outlierClusterIds`, `selectedClusterId`, `properties`, `selectedPropertyId`, `onSelectCluster`, `onSelectProperty`.
- Produces: installed GeoJSON sources/layers, operational hover popup, source updates, selection callbacks, and camera fitting/focus behavior.
- Extends: `useMapboxMap({ accessToken, styleUrl, ... })` with safe style changes and `fitCoordinates(coordinates, options)`.

- [ ] **Step 1: Extend the Mapbox mock and write failing layer tests**

The mock must record complete source/layer definitions, support `GeoJSONSource.setData`, support layer-scoped `on/off` handlers, expose `setStyle`, and clear sources/layers before emitting `style.load`.

Add tests that assert:

```ts
expect(map.sources.get('sandbox-clusters-source')?.definition).not.toHaveProperty('cluster')
expect(map.layers.has('sandbox-clusters-circles')).toBe(true)
expect(map.layers.has('sandbox-clusters-count')).toBe(true)
expect(map.fitBounds).toHaveBeenCalled()
```

Also test market mode, active-mode layer replacement, click selection, and style reload restoration.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- GlobeMapExperience.test.tsx`

Expected: FAIL because operational props and layers are not implemented.

- [ ] **Step 3: Implement the operational layer hook**

Use stable IDs:

```ts
const CLUSTER_SOURCE = 'sandbox-clusters-source'
const CLUSTER_CIRCLE_LAYER = 'sandbox-clusters-circles'
const CLUSTER_COUNT_LAYER = 'sandbox-clusters-count'
const PROPERTY_SOURCE = 'real-estate-properties-source'
const PROPERTY_CIRCLE_LAYER = 'real-estate-properties-circles'
const PROPERTY_PRICE_LAYER = 'real-estate-properties-prices'
```

The hook must:

- add or update only the active mode source,
- remove inactive operational layers before their source,
- use Mapbox expressions for radius, value color, selected stroke, outlier stroke, and labels,
- use safe DOM `textContent` for popup content,
- bind layer click and pointer handlers once per style lifecycle,
- remove popup and handlers on cleanup,
- reinstall after `style.load` without touching search sources.

- [ ] **Step 4: Add camera support to the base hook**

`fitCoordinates` must use `flyTo` for one coordinate and `LngLatBounds` plus responsive padding for multiple coordinates. It must call the existing transition guard so automatic rotation cannot interrupt the move.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- GlobeMapExperience.test.tsx`

Expected: existing search/interaction tests plus new operational layer tests pass.

---

### Task 3: One Primary Map Application Shell

**Files:**
- Create: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/GlobeMapExperience.tsx`
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- `GlobeMapExperience` consumes optional operational props with empty defaults so isolated search tests remain concise.
- `App` passes the current Sandbox/market state and selection callbacks to that component.

- [ ] **Step 1: Write failing application-shell tests**

Mock `GlobeMapExperience` with a test component that exposes received props. Assert that the initial app:

```jsx
expect(screen.queryByRole('button', { name: /globe/i })).not.toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Sandbox' })).toBeInTheDocument()
expect(screen.getByTestId('primary-map')).toBeInTheDocument()
```

Open Upload & Setup, upload a CSV with a mocked `/api/geo/upload` response, and assert the normalized clusters are passed to the same primary map. Add the equivalent market-mode prop assertion.

- [ ] **Step 2: Run application tests and verify RED**

Run: `npm test -- App.test.jsx`

Expected: FAIL because App still branches to the standalone globe and exposes the Globe navigation control.

- [ ] **Step 3: Remove the split renderer path**

Delete `showGlobeMap`, the conditional full-screen return, `ClusterMap` runtime import, MapLibre style constants, and the Globe tab. Render `GlobeMapExperience` as the full-screen map inside the existing application shell.

- [ ] **Step 4: Wire operational props**

```tsx
<GlobeMapExperience
  theme={theme}
  viewMode={activeTab}
  clusters={clusters}
  outlierClusterIds={analytics.outlierClusterIds}
  selectedClusterId={selectedClusterId}
  focusedCluster={selectedCluster}
  onSelectCluster={setSelectedClusterId}
  properties={visibleProperties}
  selectedPropertyId={selectedPropertyId}
  onSelectProperty={setSelectedPropertyId}
  controlsObscured={Boolean(activeDropdown)}
/>
```

Remove the unused MapLibre stylesheet import from `main.jsx`; do not remove package dependencies or the legacy component in this scoped change.

- [ ] **Step 5: Run application and map tests and verify GREEN**

Run: `npm test -- App.test.jsx GlobeMapExperience.test.tsx operationalMapUtils.test.ts`

Expected: all focused tests pass.

---

### Task 4: Responsive Operational UI Integration

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/GlobeMapExperience.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `controlsObscured` and existing `activeDropdown` state.
- Produces: stable desktop header, compact mobile toolbar, bounded mobile panels, and non-overlapping Mapbox search controls.

- [ ] **Step 1: Add a failing visibility test**

Render `GlobeMapExperience` with `controlsObscured` and assert the bottom controls receive the obscured modifier class while remaining accessible on desktop.

- [ ] **Step 2: Run the visibility test and verify RED**

Run: `npm test -- GlobeMapExperience.test.tsx`

Expected: FAIL because the modifier class does not exist.

- [ ] **Step 3: Implement responsive classes and CSS**

- Remove obsolete `.globe-back-button` rules.
- Keep the map canvas fixed and full viewport.
- Use a compact app header below `760px` with stable icon button dimensions.
- Hide command labels only at narrow widths while retaining `aria-label` and `title`.
- Bound dropdown panels to `max-height: calc(100dvh - header space)` and enable internal scrolling.
- On mobile only, fade and disable pointer events for `.globe-bottom-ui--obscured`; restore it when the panel closes.
- Keep attribution visible and respect safe-area insets.

- [ ] **Step 4: Run tests and build CSS output**

Run: `npm test -- GlobeMapExperience.test.tsx App.test.jsx`

Run: `npm run build`

Expected: tests pass and Vite production build exits 0.

---

### Task 5: Automated and Browser Verification

**Files:**
- Modify: `design-qa.md`
- Create: browser screenshots under `frontend/output/` only when needed for evidence.

**Interfaces:**
- Consumes: completed integrated frontend and the user-provided desktop reference screenshot.
- Produces: fresh automated evidence, desktop/mobile interaction evidence, visual comparison report, and live deployment verification.

- [ ] **Step 1: Run the full frontend verification suite**

Run from `frontend`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: test, typecheck, lint, and build commands exit 0. Existing warnings must be reported and must not hide new warnings.

- [ ] **Step 2: Verify locally in the user-selected in-app Browser**

At desktop and mobile viewports verify one Mapbox canvas, no Globe tab, Mapbox drag/wheel/touch behavior, upload panel, Sandbox and Real Estate mode changes, source/layer rendering, selection, search, and no control overlap. Inspect console errors.

- [ ] **Step 3: Perform visual comparison**

Capture the implementation at the same desktop viewport and state as `codex-clipboard-9fc347ce-e373-42ef-aae7-cceb8cc8c17b.png`. Compare source and implementation together, fix any P0/P1/P2 mismatch, repeat capture, and record evidence in `design-qa.md` with `final result: passed` or `blocked`.

- [ ] **Step 4: Deploy the frontend only**

Create a remote frontend backup, sync only changed frontend files, run `docker compose build frontend`, and recreate only the frontend service. Do not change backend, Cloudflare, DNS, tokens, or unrelated services.

- [ ] **Step 5: Verify the live deployment**

Open `https://geo-tool.homelabshare.gr/` in the in-app Browser. Re-run desktop and mobile smoke checks, upload a test dataset, verify operational layers on the primary Mapbox map, inspect console errors, and confirm the deployed asset bundle is the new build.
