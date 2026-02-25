# Real Estate Analytics Map App

Initial React scaffold with a galaxy-style background and dashboard shell for:

- map panel (Google Maps integration point)
- filter panel (price/sqm/area)
- KPI cards
- trend chart placeholder

## Run

```bash
npm install
npm run dev
```

## Map Provider

The app now uses **OpenStreetMap** tiles via `react-leaflet` and does not require an API key.

## Mock Filter Contract

Current frontend sends this filter shape to the mock API service:

```ts
{
  minPrice?: number;
  maxPrice?: number;
  minSqm?: number;
  maxSqm?: number;
  area?: string; // e.g. "Athens Center" or "All Areas"
}
```

## Next Integration Steps

1. Replace mock properties API with .NET backend endpoints.
2. Replace placeholder trend chart with live monthly aggregates.
3. Add explicit outlier marker styling (`isOutlier`) on map and table.
4. Add pagination and clustering for larger datasets.
