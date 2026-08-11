# Geo Tool

Geo Tool is a full-stack geospatial and real-estate analytics application that ingests CSV datasets, clusters geographic data, identifies outliers, filters property listings, and visualizes operational results on one interactive map.

Canonical repository: https://github.com/spandreou/geo-tool

## Features

- Upload CSV files (`latitude` / `longitude` and `value` or `price`)
- Case-insensitive CSV header handling
- Price normalization (supports symbols like `$`, `€`, commas)
- In-memory geospatial clustering on the backend
- Interactive cluster visualization on the map
- Analytics panel (total points, clusters, outlier detection)
- Light / Dark mode toggle

## Tech Stack

- **Backend:** .NET 8 Web API
- **Geospatial Processing:** NetTopologySuite
- **CSV Parsing:** CsvHelper
- **Frontend:** React (Vite) + Tailwind CSS
- **Map Visualization:** Deck.gl + react-map-gl + MapLibre

## Why This Tech Stack

- **.NET 8 Web API** gives strong performance, clean API development, and long-term maintainability.
- **NetTopologySuite** is a robust and proven geospatial library for distance calculations, centroids, and spatial operations.
- **React + Vite** provides fast development iteration and a clean component-based UI architecture.
- **Deck.gl** is ideal for rendering map data layers efficiently and supports rich interactivity for geospatial analytics.
- This combination keeps parsing and clustering reliable on the server, while delivering responsive visualization and UX on the client.

## Project Structure

- `GeoDataProcessingTool/` -> Backend (.NET 8 API)
- `frontend/` -> Frontend (React + Vite)

## Prerequisites

- .NET SDK 8.x
- Node.js 20+ (or newer) and npm

## How to Run

### 1. Start Backend

```powershell
cd "GeoDataProcessingTool"
dotnet run --urls http://localhost:5000
```

### 2. Start Frontend

```powershell
cd "frontend"
copy .env.example .env
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` (default Vite port).

## CSV Format

Accepted columns (case-insensitive):

- **Latitude:** `latitude`, `lat`, `y`, `centroidlatitude`, `centroidlat`, `centroid_lat`, `centroid_latitude`
- **Longitude:** `longitude`, `lon`, `lng`, `x`, `centroidlongitude`, `centroidlon`, `centroidlng`, `centroid_lon`, `centroid_lng`, `centroid_longitude`
- **Value/Price:** `value`, `price`, `amount`, `cost`, `val`, `revenue`, `points`, `count`

Example:

```csv
lat,lon,amount
40.6401,22.9444,"$1,234.50"
40.6405,22.9448,"€980"
```

## API Endpoint

- `POST /api/geo/upload`
- Content type: `multipart/form-data`
- Form field: `file`

Response: JSON list of clusters with centroid, point count, and average value.
