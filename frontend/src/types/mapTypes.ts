import type mapboxgl from 'mapbox-gl'

export type PlaceFeatureType =
  | 'country'
  | 'region'
  | 'postcode'
  | 'district'
  | 'place'
  | 'locality'
  | 'neighborhood'
  | 'street'
  | 'address'
  | 'poi'
  | string

export interface PlaceSuggestion {
  id: string
  mapboxId: string
  name: string
  description: string
  featureType: PlaceFeatureType
}

export interface PlaceResult {
  id: string
  mapboxId: string
  name: string
  category?: string
  address?: string
  coordinates: [number, number]
  featureType: PlaceFeatureType
  distanceMeters?: number
  rating?: number
  thumbnailUrl?: string
}

export interface MapBoundsSnapshot {
  bbox: [number, number, number, number]
  center: [number, number]
}

export interface MapboxMapApi {
  containerRef: React.RefObject<HTMLDivElement | null>
  mapRef: React.MutableRefObject<mapboxgl.Map | null>
  isReady: boolean
  error: string
  movedSinceSearch: boolean
  acknowledgeSearchLocation: () => void
  fitCoordinates: (coordinates: [number, number][], options?: { maxZoom?: number }) => void
  focusResult: (result: PlaceResult, options?: { zoom?: number; markClean?: boolean }) => void
  fitResults: (results: PlaceResult[]) => void
  getBoundsSnapshot: () => MapBoundsSnapshot | null
}

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

export interface ClusterFeatureProperties {
  id: string
  pointCount: number
  averageValue: number
  isOutlier: boolean
  isSelected: boolean
}

export interface PropertyFeatureProperties {
  id: number
  title: string
  area: string
  address: string
  price: number
  sqm: number
  pricePerUnit: number
  isOutlier: boolean
  isSelected: boolean
}
