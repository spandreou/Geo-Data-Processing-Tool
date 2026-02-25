import { useEffect, useMemo, useState } from 'react'
import { DeckGL, ScatterplotLayer, TextLayer } from 'deck.gl'
import Map from '@danuri/react-map-gl/maplibre'

const DEFAULT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const INITIAL_VIEW_STATE = {
  longitude: 22.94,
  latitude: 39.07,
  zoom: 6,
  pitch: 0,
  bearing: 0,
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

export default function ClusterMap({
  clusters,
  outlierClusterIds = [],
  selectedClusterId = null,
  focusedCluster = null,
  mapStyle = DEFAULT_MAP_STYLE,
  isDarkMode = false,
  mapOpacity = 0.72,
}) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
  const [hoverInfo, setHoverInfo] = useState(null)

  useEffect(() => {
    if (!clusters.length) {
      return
    }

    const centerLat = clusters.reduce((sum, cluster) => sum + cluster.centroidLatitude, 0) / clusters.length
    const centerLon = clusters.reduce((sum, cluster) => sum + cluster.centroidLongitude, 0) / clusters.length

    setViewState((current) => ({
      ...current,
      latitude: centerLat,
      longitude: centerLon,
      zoom: Math.max(current.zoom, 7),
    }))
  }, [clusters])

  useEffect(() => {
    if (!focusedCluster) {
      return
    }

    setViewState((current) => ({
      ...current,
      latitude: focusedCluster.centroidLatitude,
      longitude: focusedCluster.centroidLongitude,
      zoom: Math.max(current.zoom, 10.5),
    }))
  }, [focusedCluster])

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

  const labelColor = isDarkMode ? [241, 245, 249, 255] : [15, 23, 42, 255]
  const defaultOutlineColor = isDarkMode ? [203, 213, 225, 220] : [15, 23, 42, 255]

  const layers = useMemo(
    () => [
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
      }),
    ],
    [clusters, defaultOutlineColor, labelColor, outlierSet, selectedClusterId, valueBounds.max, valueBounds.min],
  )

  return (
    <div className="relative h-full w-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: nextViewState }) => setViewState(nextViewState)}
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
        controller
        layers={layers}
      >
        <Map mapStyle={mapStyle} reuseMaps style={{ opacity: mapOpacity }} />
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
          <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Cluster Stats</p>
          <p>Points: {hoverInfo.object.pointCount}</p>
          <p>Avg Value: {Number(hoverInfo.object.averageValue).toFixed(2)}</p>
          <p>
            Center: {hoverInfo.object.centroidLatitude.toFixed(4)}, {hoverInfo.object.centroidLongitude.toFixed(4)}
          </p>
          {outlierSet.has(hoverInfo.object.id) && <p className="mt-1 text-amber-600">Possible outlier</p>}
        </div>
      )}
    </div>
  )
}
