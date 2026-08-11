import type { PlaceFeatureType, PlaceResult } from '../types/mapTypes'

const EARTH_RADIUS_METERS = 6371000

export function getZoomForFeatureType(featureType: PlaceFeatureType): number {
  if (featureType === 'country') return 4.6
  if (featureType === 'region' || featureType === 'district') return 7.2
  if (featureType === 'place' || featureType === 'locality' || featureType === 'postcode') return 11.2
  if (featureType === 'neighborhood' || featureType === 'street') return 13.8
  return 15.8
}

export function formatDistance(distanceMeters?: number): string | undefined {
  if (!Number.isFinite(distanceMeters)) return undefined
  if ((distanceMeters ?? 0) < 1000) return `${Math.round(distanceMeters ?? 0)} m`
  return `${((distanceMeters ?? 0) / 1000).toFixed(1)} km`
}

export function haversineDistanceMeters(from: [number, number], to: [number, number]): number {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const [lon1, lat1] = from
  const [lon2, lat2] = to
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function getStaticThumbnailUrl(result: PlaceResult, accessToken: string): string | undefined {
  if (!accessToken) return undefined
  const [lon, lat] = result.coordinates
  const encodedToken = encodeURIComponent(accessToken)
  return `https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/static/pin-s+0ea5e9(${lon},${lat})/${lon},${lat},13,0/96x96?access_token=${encodedToken}`
}
