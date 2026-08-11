import type {
  ClusterFeatureProperties,
  MapViewMode,
  PropertyFeatureProperties,
  RealEstateProperty,
  SandboxCluster,
} from '../types/mapTypes'

type Coordinate = [number, number]

function hasFiniteCoordinates(longitude: number, latitude: number) {
  return Number.isFinite(longitude) && Number.isFinite(latitude)
}

export function createClusterFeatureCollection(
  clusters: readonly SandboxCluster[],
  outlierClusterIds: readonly string[],
  selectedClusterId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, ClusterFeatureProperties> {
  const outlierIds = new Set(outlierClusterIds)

  return {
    type: 'FeatureCollection',
    features: clusters
      .filter((cluster) => hasFiniteCoordinates(cluster.centroidLongitude, cluster.centroidLatitude))
      .map((cluster) => ({
        type: 'Feature',
        id: cluster.id,
        geometry: {
          type: 'Point',
          coordinates: [cluster.centroidLongitude, cluster.centroidLatitude],
        },
        properties: {
          id: cluster.id,
          pointCount: cluster.pointCount,
          averageValue: cluster.averageValue,
          isOutlier: outlierIds.has(cluster.id),
          isSelected: cluster.id === selectedClusterId,
        },
      })),
  }
}

export function createPropertyFeatureCollection(
  properties: readonly RealEstateProperty[],
  selectedPropertyId: number | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, PropertyFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: properties
      .filter((property) => hasFiniteCoordinates(property.lng, property.lat))
      .map((property) => ({
        type: 'Feature',
        id: property.id,
        geometry: {
          type: 'Point',
          coordinates: [property.lng, property.lat],
        },
        properties: {
          id: property.id,
          title: property.title,
          area: property.area,
          address: property.address,
          price: property.price,
          sqm: property.sqm,
          pricePerUnit: property.sqm > 0 ? property.price / property.sqm : 0,
          isOutlier: property.isOutlier,
          isSelected: property.id === selectedPropertyId,
        },
      })),
  }
}

export function getOperationalCoordinates(
  viewMode: MapViewMode,
  clusters: readonly SandboxCluster[],
  properties: readonly RealEstateProperty[],
): Coordinate[] {
  if (viewMode === 'market') {
    return properties
      .filter((property) => hasFiniteCoordinates(property.lng, property.lat))
      .map((property) => [property.lng, property.lat])
  }

  return clusters
    .filter((cluster) => hasFiniteCoordinates(cluster.centroidLongitude, cluster.centroidLatitude))
    .map((cluster) => [cluster.centroidLongitude, cluster.centroidLatitude])
}
