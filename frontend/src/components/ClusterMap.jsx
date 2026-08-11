import { useEffect, useMemo, useState, useRef } from 'react'
import { DeckGL, FlyToInterpolator, ScatterplotLayer, TextLayer } from 'deck.gl'
import Map, { NavigationControl } from '@danuri/react-map-gl/maplibre'

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const GLOBE_ZOOM_THRESHOLD = 3.25
const MIN_GLOBE_ZOOM = 1.45
const GLOBE_ROTATION_DEGREES_PER_SECOND = 0.35
const MAP_TRANSITION_MS = 900
const INITIAL_VIEW_STATE = {
  longitude: 22.94,
  latitude: 39.07,
  zoom: 6,
  pitch: 45,
  bearing: -15,
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function interpolateColor(start, end, t) {
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t),
    220,
  ]
}

function getClusterColor(averageValue, minValue, maxValue) {
  if (maxValue <= minValue) {
    return [250, 204, 21, 220]
  }

  const normalized = clamp((averageValue - minValue) / (maxValue - minValue), 0, 1)
  if (normalized <= 0.5) {
    return interpolateColor([34, 197, 94], [250, 204, 21], normalized * 2)
  }

  return interpolateColor([250, 204, 21], [239, 68, 68], (normalized - 0.5) * 2)
}

function setPaintIfLayerExists(map, layerId, property, value) {
  if (!map.getLayer(layerId)) return false

  try {
    map.setPaintProperty(layerId, property, value)
    return true
  } catch {
    return false
  }
}

function applyThemeStyles(map, isDark) {
  if (!map) return false

  const palette = isDark
    ? {
        background: '#06101d',
        residential: '#142235',
        park: '#173526',
        wood: '#123020',
        water: '#0a2b46',
        waterLine: '#1f5f86',
        boundary: '#5b6f88',
        roadCasing: '#0a1320',
        road: '#64748b',
        motorway: '#89a8c7',
        rail: '#52637a',
        building: '#1c2d41',
        label: '#e7eef7',
        labelHalo: '#06101d',
        space: '#020712',
        atmosphere: '#12395d',
      }
    : {
        background: '#f5f7fa',
        residential: '#edf1f3',
        park: '#d7eadb',
        wood: '#cfe5d3',
        water: '#b7d9ee',
        waterLine: '#8bc7e8',
        boundary: '#9aa9b9',
        roadCasing: '#ffffff',
        road: '#c8ced6',
        motorway: '#aab9c9',
        rail: '#b6bec9',
        building: '#d7dde3',
        label: '#243244',
        labelHalo: '#ffffff',
        space: '#eef6ff',
        atmosphere: '#d9ecfb',
      }

  let applied = false

  applied = setPaintIfLayerExists(map, 'background', 'background-color', palette.background) || applied
  applied = setPaintIfLayerExists(map, 'water', 'fill-color', palette.water) || applied
  applied = setPaintIfLayerExists(map, 'waterway', 'line-color', palette.waterLine) || applied
  applied = setPaintIfLayerExists(map, 'park', 'fill-color', palette.park) || applied
  applied = setPaintIfLayerExists(map, 'landuse_park', 'fill-color', palette.park) || applied
  applied = setPaintIfLayerExists(map, 'landcover_wood', 'fill-color', palette.wood) || applied
  applied = setPaintIfLayerExists(map, 'landuse_residential', 'fill-color', palette.residential) || applied
  applied = setPaintIfLayerExists(map, 'landcover_ice_shelf', 'fill-color', isDark ? '#243447' : '#f8fbff') || applied
  applied = setPaintIfLayerExists(map, 'landcover_glacier', 'fill-color', isDark ? '#26384b' : '#f3f8ff') || applied
  applied = setPaintIfLayerExists(map, 'building', 'fill-color', palette.building) || applied
  applied = setPaintIfLayerExists(map, '3d-buildings', 'fill-extrusion-color', palette.building) || applied

  const style = map.getStyle()
  for (const layer of style.layers ?? []) {
    const id = layer.id

    if (layer.type === 'line') {
      if (id.includes('boundary')) {
        applied = setPaintIfLayerExists(map, id, 'line-color', palette.boundary) || applied
        applied = setPaintIfLayerExists(map, id, 'line-opacity', isDark ? 0.62 : 0.54) || applied
      } else if (id.includes('motorway')) {
        applied = setPaintIfLayerExists(map, id, 'line-color', palette.motorway) || applied
        applied = setPaintIfLayerExists(map, id, 'line-opacity', 0.72) || applied
      } else if (id.includes('highway')) {
        applied = setPaintIfLayerExists(map, id, 'line-color', id.includes('casing') ? palette.roadCasing : palette.road) || applied
        applied = setPaintIfLayerExists(map, id, 'line-opacity', id.includes('subtle') ? 0.28 : 0.7) || applied
      } else if (id.includes('railway')) {
        applied = setPaintIfLayerExists(map, id, 'line-color', palette.rail) || applied
        applied = setPaintIfLayerExists(map, id, 'line-opacity', 0.45) || applied
      }
    }

    if (layer.type === 'symbol' && layer.layout?.['text-field']) {
      applied = setPaintIfLayerExists(map, id, 'text-color', palette.label) || applied
      applied = setPaintIfLayerExists(map, id, 'text-halo-color', palette.labelHalo) || applied
      applied = setPaintIfLayerExists(map, id, 'text-halo-width', isDark ? 1.2 : 1.4) || applied
      applied = setPaintIfLayerExists(map, id, 'text-opacity', 0.94) || applied
    }
  }

  if (map.setFog) {
    map.setFog({
      color: palette.atmosphere,
      'high-color': palette.atmosphere,
      'space-color': palette.space,
      'horizon-blend': isDark ? 0.08 : 0.12,
      'star-intensity': isDark ? 0.08 : 0,
    })
  }

  return applied
}

function wrapLongitude(longitude) {
  if (longitude > 180) return longitude - 360
  if (longitude < -180) return longitude + 360
  return longitude
}

function formatCompactPrice(price) {
  if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`
  return `${Math.round(price / 1000)}K`
}

export default function ClusterMap({
  clusters,
  outlierClusterIds = [],
  selectedClusterId = null,
  focusedCluster = null,
  mapStyle = DEFAULT_MAP_STYLE,
  isDarkMode = false,
  mapOpacity = 0.72,
  // New props for Real Estate Market integration
  viewMode = 'sandbox',
  properties = [],
  selectedPropertyId = null,
  onSelectProperty = null,
}) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
  const [hoverInfo, setHoverInfo] = useState(null)
  const mapRef = useRef(null)
  const isDarkModeRef = useRef(isDarkMode)
  const lastThemedStyleRef = useRef('')
  const globeModeRef = useRef(INITIAL_VIEW_STATE.zoom <= GLOBE_ZOOM_THRESHOLD)
  const isInteractingRef = useRef(false)
  const rotationFrameRef = useRef(null)
  const lastRotationTimestampRef = useRef(0)
  const isGlobeView = viewState.zoom <= GLOBE_ZOOM_THRESHOLD

  useEffect(() => {
    isDarkModeRef.current = isDarkMode
    lastThemedStyleRef.current = ''
    const map = mapRef.current?.getMap()
    if (map) {
      applyThemeStyles(map, isDarkMode)
    }
  }, [isDarkMode])

  useEffect(() => {
    lastThemedStyleRef.current = ''
  }, [mapStyle])

  useEffect(() => {
    if (globeModeRef.current === isGlobeView) {
      return
    }

    globeModeRef.current = isGlobeView

    const frame = requestAnimationFrame(() => {
      setViewState((current) => ({
        ...current,
        pitch: isGlobeView ? Math.min(current.pitch, 8) : Math.max(current.pitch, 42),
        bearing: isGlobeView ? current.bearing * 0.35 : current.bearing,
        transitionDuration: MAP_TRANSITION_MS,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.1 }),
      }))
    })

    return () => cancelAnimationFrame(frame)
  }, [isGlobeView])

  useEffect(() => {
    if (!isGlobeView) {
      return
    }

    const rotate = (timestamp) => {
      if (!lastRotationTimestampRef.current) {
        lastRotationTimestampRef.current = timestamp
      }

      const elapsed = Math.min(64, timestamp - lastRotationTimestampRef.current)
      lastRotationTimestampRef.current = timestamp

      setViewState((current) => {
        const canRotate =
          current.zoom <= GLOBE_ZOOM_THRESHOLD &&
          !isInteractingRef.current &&
          document.visibilityState === 'visible'

        if (!canRotate) {
          return current
        }

        return {
          ...current,
          longitude: wrapLongitude(current.longitude + (elapsed / 1000) * GLOBE_ROTATION_DEGREES_PER_SECOND),
        }
      })

      rotationFrameRef.current = requestAnimationFrame(rotate)
    }

    lastRotationTimestampRef.current = 0
    rotationFrameRef.current = requestAnimationFrame(rotate)

    return () => {
      if (rotationFrameRef.current) {
        cancelAnimationFrame(rotationFrameRef.current)
      }
      rotationFrameRef.current = null
      lastRotationTimestampRef.current = 0
    }
  }, [isGlobeView])

  useEffect(() => {
    if (viewMode !== 'sandbox' || !clusters.length) {
      return
    }

    const centerLat = clusters.reduce((sum, cluster) => sum + cluster.centroidLatitude, 0) / clusters.length
    const centerLon = clusters.reduce((sum, cluster) => sum + cluster.centroidLongitude, 0) / clusters.length

    const frame = requestAnimationFrame(() => {
      setViewState((current) => ({
        ...current,
        latitude: centerLat,
        longitude: centerLon,
        zoom: Math.max(current.zoom, 7),
      }))
    })

    return () => cancelAnimationFrame(frame)
  }, [clusters, viewMode])

  useEffect(() => {
    if (viewMode !== 'sandbox' || !focusedCluster) {
      return
    }

    const frame = requestAnimationFrame(() => {
      setViewState((current) => ({
        ...current,
        latitude: focusedCluster.centroidLatitude,
        longitude: focusedCluster.centroidLongitude,
        zoom: Math.max(current.zoom, 10.5),
      }))
    })

    return () => cancelAnimationFrame(frame)
  }, [focusedCluster, viewMode])

  // Center on visible real estate properties when they load/change
  useEffect(() => {
    if (viewMode !== 'market' || !properties.length) {
      return
    }

    const centerLat = properties.reduce((sum, p) => sum + p.lat, 0) / properties.length
    const centerLon = properties.reduce((sum, p) => sum + p.lng, 0) / properties.length

    const frame = requestAnimationFrame(() => {
      setViewState((current) => ({
        ...current,
        latitude: centerLat,
        longitude: centerLon,
        zoom: properties.length === 1 ? 13.5 : Math.max(current.zoom, 8.5),
      }))
    })

    return () => cancelAnimationFrame(frame)
  }, [properties, viewMode])

  // Center on selected property
  useEffect(() => {
    if (viewMode !== 'market' || !properties.length || selectedPropertyId === null) {
      return
    }

    const selected = properties.find((p) => p.id === selectedPropertyId)
    if (selected) {
      const frame = requestAnimationFrame(() => {
        setViewState((current) => ({
          ...current,
          latitude: selected.lat,
          longitude: selected.lng,
          zoom: Math.max(current.zoom, 13.5),
        }))
      })

      return () => cancelAnimationFrame(frame)
    }
  }, [selectedPropertyId, properties, viewMode])

  const outlierSet = useMemo(() => new Set(outlierClusterIds), [outlierClusterIds])
  const valueBounds = useMemo(() => {
    if (!clusters.length) {
      return { min: 0, max: 1 }
    }

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY

    for (const cluster of clusters) {
      min = Math.min(min, cluster.averageValue)
      max = Math.max(max, cluster.averageValue)
    }

    return { min, max }
  }, [clusters])

  const labelColor = useMemo(() => (isDarkMode ? [241, 245, 249, 255] : [15, 23, 42, 255]), [isDarkMode])
  const defaultOutlineColor = useMemo(() => (isDarkMode ? [203, 213, 225, 220] : [15, 23, 42, 255]), [isDarkMode])

  const layers = useMemo(() => {
    if (viewMode === 'market') {
      return [
        new ScatterplotLayer({
          id: 'properties-scatter',
          data: properties,
          pickable: true,
          radiusUnits: 'pixels',
          getPosition: (p) => [p.lng, p.lat],
          getRadius: (p) => (p.id === selectedPropertyId ? 9.5 : 7),
          getFillColor: (p) => (p.isOutlier ? [239, 68, 68, 220] : [16, 185, 129, 220]),
          getLineColor: (p) => (p.id === selectedPropertyId ? [255, 255, 255, 255] : [15, 23, 42, 220]),
          getLineWidth: (p) => (p.id === selectedPropertyId ? 3 : 1.5),
          lineWidthUnits: 'pixels',
          stroked: true,
          filled: true,
        }),
        new TextLayer({
          id: 'properties-prices',
          data: properties,
          pickable: false,
          getPosition: (p) => [p.lng, p.lat],
          getText: (p) => formatCompactPrice(p.price),
          getSize: 11,
          sizeUnits: 'pixels',
          getColor: labelColor,
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'bottom',
          pixelOffset: [0, -10],
          outlineWidth: 2,
          outlineColor: isDarkMode ? [15, 23, 42, 255] : [255, 255, 255, 255],
        }),
      ]
    }

    return [
      new ScatterplotLayer({
        id: 'clusters-scatter',
        data: clusters,
        pickable: true,
        radiusUnits: 'meters',
        getPosition: (cluster) => [cluster.centroidLongitude, cluster.centroidLatitude],
        getRadius: (cluster) => {
          const valueScale = Math.min(1.8, Math.max(0.8, cluster.averageValue / 100))
          const baseRadius = Math.max(120, Math.sqrt(cluster.pointCount) * 110 * valueScale)
          return cluster.id === selectedClusterId ? baseRadius * 1.2 : baseRadius
        },
        getFillColor: (cluster) => getClusterColor(cluster.averageValue, valueBounds.min, valueBounds.max),
        getLineColor: (cluster) => {
          if (cluster.id === selectedClusterId) return [255, 255, 255, 255]
          if (outlierSet.has(cluster.id)) return [153, 27, 27, 255]
          return defaultOutlineColor
        },
        getLineWidth: (cluster) => {
          if (cluster.id === selectedClusterId) return 3.5
          if (outlierSet.has(cluster.id)) return 3
          return 1.5
        },
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: true,
      }),
      new TextLayer({
        id: 'clusters-labels',
        data: clusters,
        pickable: false,
        getPosition: (cluster) => [cluster.centroidLongitude, cluster.centroidLatitude],
        getText: (cluster) => `${cluster.pointCount}`,
        getSize: 14,
        sizeUnits: 'pixels',
        getColor: labelColor,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        outlineWidth: 1.5,
        outlineColor: isDarkMode ? [15, 23, 42, 255] : [255, 255, 255, 255],
      }),
    ]
  }, [
    viewMode,
    properties,
    selectedPropertyId,
    clusters,
    selectedClusterId,
    defaultOutlineColor,
    labelColor,
    outlierSet,
    valueBounds.max,
    valueBounds.min,
    isDarkMode,
  ])

  const onStyleData = () => {
    const map = mapRef.current?.getMap()
    if (!map) return

    // Ensure style is loaded before configuring layers/projection
    if (!map.isStyleLoaded()) return

    // Determine the dark/light nature of the currently loaded style from its background color.
    // This is more robust than checking the style URL or name, as OpenFreeMap uses a shared sprite sheet
    // and lacks a distinct style name in the loaded JSON object.
    const bgLayer = map.getLayer('background')
    if (bgLayer) {
      const bgColor = map.getPaintProperty('background', 'background-color')
      if (bgColor) {
        const str = String(bgColor).toLowerCase().trim()
        let isLoadedStyleDark = false
        if (str.startsWith('#')) {
          const r = parseInt(str.slice(1, 3), 16)
          isLoadedStyleDark = r < 128
        } else if (str.startsWith('rgb')) {
          const match = str.match(/\d+/)
          if (match) {
            const r = parseInt(match[0], 10)
            isLoadedStyleDark = r < 128
          }
        }

        if (isLoadedStyleDark !== isDarkModeRef.current) {
          return
        }
      }
    }

    const currentStyle = mapStyle
    const themeKey = `${currentStyle}-${isDarkModeRef.current}`

    if (lastThemedStyleRef.current !== themeKey) {
      const success = applyThemeStyles(map, isDarkModeRef.current)
      if (success) {
        lastThemedStyleRef.current = themeKey
      }
    }

    if (map.setProjection && map.getProjection()?.type !== 'globe') {
      map.setProjection({
        type: 'globe'
      })
    }

    if (!map.getSource('terrain-dem')) {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
      })
      map.setTerrain({
        source: 'terrain-dem',
        exaggeration: 0.75,
      })
    }

    if (!map.getLayer('3d-buildings')) {
      const sourceId = map.getSource('openmaptiles')
        ? 'openmaptiles'
        : (map.getSource('openfreemap') ? 'openfreemap' : '')

      if (sourceId) {
        const layers = map.getStyle().layers
        let labelLayerId = ''
        for (const layer of layers) {
          if (layer.type === 'symbol' && layer.layout?.['text-field']) {
            labelLayerId = layer.id
            break
          }
        }

        map.addLayer(
          {
            id: '3d-buildings',
            source: sourceId,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': isDarkModeRef.current ? '#1c2d41' : '#d7dde3',
              'fill-extrusion-height': ['get', 'render_height'],
              'fill-extrusion-base': ['get', 'render_min_height'],
              'fill-extrusion-opacity': 0.58,
            },
          },
          labelLayerId
        )
      }
    }
  }

  return (
    <div className="relative h-full w-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }) => setViewState(nextViewState)}
        onInteractionStateChange={(interactionState) => {
          isInteractingRef.current = Object.values(interactionState).some(Boolean)
        }}
        onClick={(info) => {
          if (info.object && viewMode === 'market' && onSelectProperty) {
            onSelectProperty(info.object.id)
          }
        }}
        onHover={(info) => {
          if (!info?.object) {
            setHoverInfo(null)
            return
          }

          setHoverInfo({
            x: info.x,
            y: info.y,
            object: info.object,
          })
        }}
        controller={{
          doubleClickZoom: true,
          dragPan: true,
          dragRotate: true,
          minZoom: MIN_GLOBE_ZOOM,
          maxPitch: 70,
          scrollZoom: true,
          touchRotate: true,
        }}
        layers={layers}
      >
        <Map
          ref={mapRef}
          mapStyle={mapStyle}
          reuseMaps
          style={{ opacity: mapOpacity }}
          onStyleData={onStyleData}
          onIdle={onStyleData}
          onLoad={(evt) => {
            const map = evt.target
            map.once('idle', onStyleData)
            map.on('style.load', () => {
              lastThemedStyleRef.current = ''
              map.once('idle', onStyleData)
            })
          }}
        >
          <NavigationControl position="top-right" />
        </Map>
      </DeckGL>

      {hoverInfo && (
        <div
          className={`pointer-events-none absolute z-30 w-56 rounded-md border p-2.5 text-xs shadow-lg backdrop-blur-sm ${
            isDarkMode
              ? 'border-slate-500/70 bg-slate-900/88 text-slate-100'
              : 'border-slate-300/70 bg-white/92 text-slate-800'
          }`}
          style={{
            left: hoverInfo.x + 12,
            top: hoverInfo.y + 12,
          }}
        >
          {viewMode === 'market' ? (
            <>
              <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{hoverInfo.object.title}</p>
              <p className="mt-1">Price: <strong className="text-blue-500">EUR {hoverInfo.object.price.toLocaleString()}</strong></p>
              {hoverInfo.object.sqm <= 15 ? (
                <>
                  <p>Size: {hoverInfo.object.sqm} {hoverInfo.object.sqm === 1 ? 'unit' : 'units'}</p>
                  <p>Price/unit: EUR {Math.round(hoverInfo.object.price / hoverInfo.object.sqm).toLocaleString()}</p>
                </>
              ) : (
                <>
                  <p>Size: {hoverInfo.object.sqm} sqm</p>
                  <p>Price/sqm: EUR {Math.round(hoverInfo.object.price / hoverInfo.object.sqm).toLocaleString()}</p>
                </>
              )}
              <p className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} truncate`}>{hoverInfo.object.address}</p>
              {hoverInfo.object.isOutlier && <p className="mt-1 text-red-500 font-bold">Area Outlier Listing</p>}
            </>
          ) : (
            <>
              <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Cluster Stats</p>
              <p>Points: {hoverInfo.object.pointCount}</p>
              <p>Avg Value: {Number(hoverInfo.object.averageValue).toFixed(2)}</p>
              <p>
                Center: {hoverInfo.object.centroidLatitude.toFixed(4)}, {hoverInfo.object.centroidLongitude.toFixed(4)}
              </p>
              {outlierSet.has(hoverInfo.object.id) && <p className="mt-1 text-amber-600">Possible outlier</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
