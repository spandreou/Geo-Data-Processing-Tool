import { useCallback, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import type { MapViewMode, RealEstateProperty, SandboxCluster } from '../types/mapTypes'
import {
  createClusterFeatureCollection,
  createPropertyFeatureCollection,
  getOperationalCoordinates,
} from '../utils/operationalMapUtils'

const CLUSTER_SOURCE = 'sandbox-clusters-source'
const CLUSTER_CIRCLE_LAYER = 'sandbox-clusters-circles'
const CLUSTER_COUNT_LAYER = 'sandbox-clusters-count'
const PROPERTY_SOURCE = 'real-estate-properties-source'
const PROPERTY_CIRCLE_LAYER = 'real-estate-properties-circles'
const PROPERTY_PRICE_LAYER = 'real-estate-properties-prices'

const CLUSTER_LAYERS = [CLUSTER_COUNT_LAYER, CLUSTER_CIRCLE_LAYER]
const PROPERTY_LAYERS = [PROPERTY_PRICE_LAYER, PROPERTY_CIRCLE_LAYER]

interface OperationalLayerOptions {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>
  isReady: boolean
  viewMode: MapViewMode
  clusters: readonly SandboxCluster[]
  outlierClusterIds: readonly string[]
  selectedClusterId: string | null
  properties: readonly RealEstateProperty[]
  selectedPropertyId: number | null
  onSelectCluster: (id: string) => void
  onSelectProperty: (id: number) => void
  fitCoordinates: (coordinates: [number, number][], options?: { maxZoom?: number }) => void
}

interface LayerBinding {
  event: 'click' | 'mouseenter' | 'mouseleave'
  layerId: string
  handler: (event: mapboxgl.MapLayerMouseEvent) => void
}

function removeLayerGroup(map: mapboxgl.Map, layerIds: readonly string[], sourceId: string) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
  })
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

function updateGeoJsonSource(map: mapboxgl.Map, sourceId: string, data: GeoJSON.FeatureCollection<GeoJSON.Point>) {
  const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
  if (source) {
    source.setData(data)
    return
  }

  map.addSource(sourceId, { type: 'geojson', data })
}

function getValueRange(values: number[]) {
  const finiteValues = values.filter(Number.isFinite)
  if (finiteValues.length === 0) return { min: 0, midpoint: 0.5, max: 1, hasRange: false }

  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  return { min, midpoint: min + (max - min) / 2, max, hasRange: max > min }
}

function makePopupContent(properties: Record<string, unknown>, viewMode: MapViewMode) {
  const container = document.createElement('div')
  container.className = 'map-data-popup'

  const title = document.createElement('strong')
  title.textContent = viewMode === 'market' ? String(properties.title ?? 'Property') : 'Cluster stats'
  container.append(title)

  const rows =
    viewMode === 'market'
      ? [
          `Price: EUR ${Number(properties.price ?? 0).toLocaleString()}`,
          `Size: ${Number(properties.sqm ?? 0).toLocaleString()} sqm`,
          `Price/sqm: EUR ${Math.round(Number(properties.pricePerUnit ?? 0)).toLocaleString()}`,
          String(properties.address ?? ''),
        ]
      : [
          `Points: ${Number(properties.pointCount ?? 0).toLocaleString()}`,
          `Average value: ${Number(properties.averageValue ?? 0).toFixed(2)}`,
        ]

  rows.filter(Boolean).forEach((text) => {
    const row = document.createElement('span')
    row.textContent = text
    container.append(row)
  })

  if (properties.isOutlier) {
    const outlier = document.createElement('span')
    outlier.className = 'map-data-popup__outlier'
    outlier.textContent = viewMode === 'market' ? 'Area outlier listing' : 'Possible outlier'
    container.append(outlier)
  }

  return container
}

export function useMapboxOperationalLayers(options: OperationalLayerOptions) {
  const {
    mapRef,
    isReady,
    viewMode,
    clusters,
    outlierClusterIds,
    properties,
    selectedClusterId,
    selectedPropertyId,
    fitCoordinates,
  } = options
  const latestRef = useRef(options)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const bindingsRef = useRef<LayerBinding[]>([])
  const fittedDatasetRef = useRef('')

  useEffect(() => {
    latestRef.current = options
  }, [options])

  const unbindInteractions = useCallback((map: mapboxgl.Map) => {
    bindingsRef.current.forEach(({ event, layerId, handler }) => {
      map.off(event, layerId, handler)
    })
    bindingsRef.current = []
    popupRef.current?.remove()
    popupRef.current = null
    map.getCanvas().style.cursor = ''
  }, [])

  const bindLayer = useCallback(
    (map: mapboxgl.Map, binding: LayerBinding) => {
      map.on(binding.event, binding.layerId, binding.handler)
      bindingsRef.current.push(binding)
    },
    [],
  )

  const bindInteractions = useCallback(
    (map: mapboxgl.Map, viewMode: MapViewMode) => {
      unbindInteractions(map)
      const layerId = viewMode === 'market' ? PROPERTY_CIRCLE_LAYER : CLUSTER_CIRCLE_LAYER

      bindLayer(map, {
        event: 'click',
        layerId,
        handler: (event) => {
          const properties = event.features?.[0]?.properties
          if (!properties) return

          if (viewMode === 'market') {
            const id = Number(properties.id)
            if (Number.isFinite(id)) latestRef.current.onSelectProperty(id)
          } else if (typeof properties.id === 'string') {
            latestRef.current.onSelectCluster(properties.id)
          }
        },
      })

      bindLayer(map, {
        event: 'mouseenter',
        layerId,
        handler: (event) => {
          const feature = event.features?.[0]
          if (!feature?.properties) return

          map.getCanvas().style.cursor = 'pointer'
          popupRef.current?.remove()
          popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 14 })
            .setLngLat(event.lngLat)
            .setDOMContent(makePopupContent(feature.properties, viewMode))
            .addTo(map)
        },
      })

      bindLayer(map, {
        event: 'mouseleave',
        layerId,
        handler: () => {
          map.getCanvas().style.cursor = ''
          popupRef.current?.remove()
          popupRef.current = null
        },
      })
    },
    [bindLayer, unbindInteractions],
  )

  const installLayers = useCallback(() => {
    const map = latestRef.current.mapRef.current
    if (!map) return

    const {
      viewMode,
      clusters,
      outlierClusterIds,
      selectedClusterId,
      properties,
      selectedPropertyId,
    } = latestRef.current

    if (viewMode === 'market') {
      removeLayerGroup(map, CLUSTER_LAYERS, CLUSTER_SOURCE)
      const data = createPropertyFeatureCollection(properties, selectedPropertyId)
      updateGeoJsonSource(map, PROPERTY_SOURCE, data)
      const priceRange = getValueRange(properties.map((property) => property.price))

      if (!map.getLayer(PROPERTY_CIRCLE_LAYER)) {
        map.addLayer({
          id: PROPERTY_CIRCLE_LAYER,
          type: 'circle',
          source: PROPERTY_SOURCE,
          paint: {
            'circle-color': priceRange.hasRange
              ? [
                  'case',
                  ['get', 'isOutlier'],
                  '#ef4444',
                  [
                    'interpolate',
                    ['linear'],
                    ['get', 'price'],
                    priceRange.min,
                    '#10b981',
                    priceRange.midpoint,
                    '#22d3ee',
                    priceRange.max,
                    '#3b82f6',
                  ],
                ]
              : ['case', ['get', 'isOutlier'], '#ef4444', '#10b981'],
            'circle-radius': ['case', ['get', 'isSelected'], 10, 7],
            'circle-stroke-color': ['case', ['get', 'isSelected'], '#ffffff', '#0f172a'],
            'circle-stroke-width': ['case', ['get', 'isSelected'], 3, 1.5],
            'circle-opacity': 0.92,
          },
        })
      }

      if (!map.getLayer(PROPERTY_PRICE_LAYER)) {
        map.addLayer({
          id: PROPERTY_PRICE_LAYER,
          type: 'symbol',
          source: PROPERTY_SOURCE,
          minzoom: 6,
          layout: {
            'text-field': ['number-format', ['get', 'price'], { 'max-fraction-digits': 0 }],
            'text-size': 11,
            'text-offset': [0, -1.25],
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#07111f',
            'text-halo-width': 1.5,
          },
        })
      }
    } else {
      removeLayerGroup(map, PROPERTY_LAYERS, PROPERTY_SOURCE)
      const data = createClusterFeatureCollection(clusters, outlierClusterIds, selectedClusterId)
      updateGeoJsonSource(map, CLUSTER_SOURCE, data)
      const valueRange = getValueRange(clusters.map((cluster) => cluster.averageValue))

      if (!map.getLayer(CLUSTER_CIRCLE_LAYER)) {
        map.addLayer({
          id: CLUSTER_CIRCLE_LAYER,
          type: 'circle',
          source: CLUSTER_SOURCE,
          paint: {
            'circle-color': valueRange.hasRange
              ? [
                  'interpolate',
                  ['linear'],
                  ['get', 'averageValue'],
                  valueRange.min,
                  '#22c55e',
                  valueRange.midpoint,
                  '#facc15',
                  valueRange.max,
                  '#ef4444',
                ]
              : '#facc15',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['sqrt', ['max', 1, ['get', 'pointCount']]],
              1,
              10,
              12,
              28,
            ],
            'circle-stroke-color': [
              'case',
              ['get', 'isSelected'],
              '#ffffff',
              ['get', 'isOutlier'],
              '#f59e0b',
              '#0f172a',
            ],
            'circle-stroke-width': [
              'case',
              ['get', 'isSelected'],
              3.5,
              ['get', 'isOutlier'],
              3,
              1.5,
            ],
            'circle-opacity': 0.9,
          },
        })
      }

      if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: 'symbol',
          source: CLUSTER_SOURCE,
          layout: {
            'text-field': ['to-string', ['get', 'pointCount']],
            'text-size': 12,
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.25,
          },
        })
      }
    }

    bindInteractions(map, viewMode)
  }, [bindInteractions])

  useEffect(() => {
    const map = mapRef.current
    if (!isReady || !map) return

    installLayers()
    map.on('style.load', installLayers)
    return () => {
      map.off('style.load', installLayers)
      unbindInteractions(map)
    }
  }, [installLayers, isReady, mapRef, unbindInteractions])

  useEffect(() => {
    if (!isReady) return
    installLayers()
  }, [
    clusters,
    installLayers,
    isReady,
    outlierClusterIds,
    properties,
    selectedClusterId,
    selectedPropertyId,
    viewMode,
  ])

  useEffect(() => {
    if (!isReady) return
    const coordinates = getOperationalCoordinates(viewMode, clusters, properties)
    if (coordinates.length === 0) return

    const signature = `${viewMode}:${coordinates.map((coordinate) => coordinate.join(',')).join('|')}`
    if (fittedDatasetRef.current === signature) return
    fittedDatasetRef.current = signature
    fitCoordinates(coordinates, { maxZoom: viewMode === 'market' ? 14 : 12 })
  }, [clusters, fitCoordinates, isReady, properties, viewMode])

  useEffect(
    () => () => {
      const map = latestRef.current.mapRef.current
      if (!map) return
      unbindInteractions(map)
      removeLayerGroup(map, CLUSTER_LAYERS, CLUSTER_SOURCE)
      removeLayerGroup(map, PROPERTY_LAYERS, PROPERTY_SOURCE)
    },
    [unbindInteractions],
  )
}
