import { describe, expect, it } from 'vitest'
import {
  createClusterFeatureCollection,
  createPropertyFeatureCollection,
  getOperationalCoordinates,
} from './operationalMapUtils'

const clusters = [
  {
    id: 'cluster-1',
    centroidLatitude: 37.98,
    centroidLongitude: 23.72,
    pointCount: 8,
    averageValue: 120,
  },
  {
    id: 'cluster-2',
    centroidLatitude: 40.64,
    centroidLongitude: 22.94,
    pointCount: 1,
    averageValue: 80,
  },
]

const properties = [
  {
    id: 7,
    title: 'Central apartment',
    area: 'Athens',
    address: 'Example street 1',
    price: 245000,
    sqm: 82,
    lat: 37.99,
    lng: 23.73,
    createdAt: '2026-07-16',
    isOutlier: false,
  },
]

describe('operationalMapUtils', () => {
  it('converts backend clusters into selected and outlier GeoJSON features', () => {
    const collection = createClusterFeatureCollection(clusters, ['cluster-2'], 'cluster-1')

    expect(collection.features).toHaveLength(2)
    expect(collection.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [23.72, 37.98] },
      properties: {
        id: 'cluster-1',
        pointCount: 8,
        averageValue: 120,
        isSelected: true,
        isOutlier: false,
      },
    })
    expect(collection.features[1]?.properties).toMatchObject({
      id: 'cluster-2',
      isSelected: false,
      isOutlier: true,
    })
  })

  it('keeps one GeoJSON feature per visible property', () => {
    const collection = createPropertyFeatureCollection(properties, 7)

    expect(collection.features).toHaveLength(1)
    expect(collection.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [23.73, 37.99] },
      properties: {
        id: 7,
        title: 'Central apartment',
        price: 245000,
        isSelected: true,
        isOutlier: false,
      },
    })
  })

  it('excludes records with non-finite coordinates', () => {
    const invalidCluster = { ...clusters[0], id: 'invalid', centroidLatitude: Number.NaN }
    const invalidProperty = { ...properties[0], id: 8, lng: Number.POSITIVE_INFINITY }

    expect(createClusterFeatureCollection([...clusters, invalidCluster], [], null).features).toHaveLength(2)
    expect(createPropertyFeatureCollection([...properties, invalidProperty], null).features).toHaveLength(1)
  })

  it('returns coordinates only for the active operational mode', () => {
    expect(getOperationalCoordinates('sandbox', clusters, properties)).toEqual([
      [23.72, 37.98],
      [22.94, 40.64],
    ])
    expect(getOperationalCoordinates('market', clusters, properties)).toEqual([[23.73, 37.99]])
  })
})
