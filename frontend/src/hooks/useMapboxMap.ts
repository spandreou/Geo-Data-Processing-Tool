import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { MapBoundsSnapshot, MapboxMapApi, PlaceResult } from '../types/mapTypes'
import { getZoomForFeatureType } from '../utils/mapSearchUtils'

const INITIAL_CENTER: [number, number] = [22.2, 43.8]
const INITIAL_ZOOM = 1.72
const ROTATION_MAX_ZOOM = 2.85
const ROTATION_DEGREES_PER_SECOND = 0.75
const WHEEL_ZOOM_RATE = 1 / 180
const LOW_ZOOM_LABEL_SOURCE = 'continent-labels'
const CLUSTER_SOURCE = 'place-results-source'
const CLUSTER_LAYER = 'place-results-clusters'
const CLUSTER_COUNT_LAYER = 'place-results-cluster-count'
const UNCLUSTERED_LAYER = 'place-results-unclustered'

const CONTINENT_LABELS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'NORTH\nAMERICA' }, geometry: { type: 'Point', coordinates: [-105, 42] } },
    { type: 'Feature', properties: { name: 'SOUTH\nAMERICA' }, geometry: { type: 'Point', coordinates: [-62, -28] } },
    { type: 'Feature', properties: { name: 'EUROPE' }, geometry: { type: 'Point', coordinates: [14, 49] } },
    { type: 'Feature', properties: { name: 'ASIA' }, geometry: { type: 'Point', coordinates: [90, 48] } },
    { type: 'Feature', properties: { name: 'AFRICA' }, geometry: { type: 'Point', coordinates: [22, 2] } },
    { type: 'Feature', properties: { name: 'OCEANIA' }, geometry: { type: 'Point', coordinates: [135, -24] } },
  ],
} satisfies GeoJSON.FeatureCollection<GeoJSON.Point, { name: string }>

function hasReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function createFeatureCollection(results: PlaceResult[]): GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }> {
  return {
    type: 'FeatureCollection',
    features: results.map((result) => ({
      type: 'Feature',
      properties: { id: result.id },
      geometry: { type: 'Point', coordinates: result.coordinates },
    })),
  }
}

function makeMarkerElement(result: PlaceResult, selected: boolean) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `globe-marker${selected ? ' globe-marker--selected' : ''}`
  marker.setAttribute('aria-label', `Επιλογή ${result.name}`)

  if (typeof result.rating === 'number') {
    marker.innerHTML = `<span class="globe-marker-rating">★ ${result.rating.toFixed(1)}</span>`
  } else {
    marker.innerHTML = '<span class="globe-marker-dot"></span>'
  }

  return marker
}

export function useMapboxMap({
  accessToken,
  styleUrl,
  results,
  selectedResultId,
  onSelectResult,
}: {
  accessToken: string
  styleUrl: string
  results: PlaceResult[]
  selectedResultId: string | null
  onSelectResult: (id: string) => void
}): MapboxMapApi {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const initializedRef = useRef(false)
  const initialStyleUrlRef = useRef(styleUrl)
  const activeStyleUrlRef = useRef(styleUrl)
  const userInteractingRef = useRef(false)
  const suppressMoveRef = useRef(false)
  const cameraTransitionRef = useRef(false)
  const cameraTransitionTimeoutRef = useRef<number | null>(null)
  const interactionReleaseTimeoutRef = useRef<number | null>(null)
  const rotationFrameRef = useRef<number | null>(null)
  const lastRotationTimestampRef = useRef(0)
  const selectedResultRef = useRef<string | null>(selectedResultId)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState('')
  const [movedSinceSearch, setMovedSinceSearch] = useState(false)

  useEffect(() => {
    selectedResultRef.current = selectedResultId
  }, [selectedResultId])

  const acknowledgeSearchLocation = useCallback(() => {
    setMovedSinceSearch(false)
  }, [])

  const beginCameraTransition = useCallback((duration: number) => {
    cameraTransitionRef.current = true
    suppressMoveRef.current = true
    if (cameraTransitionTimeoutRef.current !== null) {
      window.clearTimeout(cameraTransitionTimeoutRef.current)
    }
    cameraTransitionTimeoutRef.current = window.setTimeout(() => {
      cameraTransitionRef.current = false
      suppressMoveRef.current = false
      cameraTransitionTimeoutRef.current = null
    }, duration)
  }, [])

  const getBoundsSnapshot = useCallback((): MapBoundsSnapshot | null => {
    const map = mapRef.current
    if (!map) return null
    const bounds = map.getBounds()
    const center = map.getCenter()
    if (!bounds) return null

    return {
      bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      center: [center.lng, center.lat],
    }
  }, [])

  const focusResult = useCallback((result: PlaceResult, options?: { zoom?: number; markClean?: boolean }) => {
    const map = mapRef.current
    if (!map) return

    beginCameraTransition(1000)
    map.flyTo({
      center: result.coordinates,
      zoom: options?.zoom ?? getZoomForFeatureType(result.featureType),
      essential: true,
      duration: hasReducedMotion() ? 0 : 950,
    })
    if (options?.markClean ?? true) {
      setMovedSinceSearch(false)
    }
  }, [beginCameraTransition])

  const fitResults = useCallback((nextResults: PlaceResult[]) => {
    const map = mapRef.current
    if (!map || nextResults.length === 0) return

    if (nextResults.length === 1) {
      focusResult(nextResults[0])
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    nextResults.forEach((result) => bounds.extend(result.coordinates))
    beginCameraTransition(1100)
    map.fitBounds(bounds, {
      padding: { top: 90, right: 56, bottom: 230, left: 56 },
      maxZoom: 14,
      duration: hasReducedMotion() ? 0 : 1000,
    })
    setMovedSinceSearch(false)
  }, [beginCameraTransition, focusResult])

  const fitCoordinates = useCallback((coordinates: [number, number][], options?: { maxZoom?: number }) => {
    const map = mapRef.current
    if (!map || coordinates.length === 0) return

    if (coordinates.length === 1) {
      beginCameraTransition(1000)
      map.flyTo({
        center: coordinates[0],
        zoom: options?.maxZoom ?? 11,
        essential: true,
        duration: hasReducedMotion() ? 0 : 900,
      })
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    coordinates.forEach((coordinate) => bounds.extend(coordinate))
    beginCameraTransition(1100)
    map.fitBounds(bounds, {
      padding:
        window.innerWidth < 760
          ? { top: 150, right: 32, bottom: 230, left: 32 }
          : { top: 120, right: 72, bottom: 180, left: 72 },
      maxZoom: options?.maxZoom ?? 12,
      duration: hasReducedMotion() ? 0 : 1000,
    })
  }, [beginCameraTransition])

  useEffect(() => {
    if (!accessToken) {
      return
    }

    if (initializedRef.current || !containerRef.current) return

    if (!mapboxgl.supported(false)) {
      queueMicrotask(() => setError('Ο browser δεν υποστηρίζει WebGL για Mapbox.'))
      return
    }

    initializedRef.current = true
    mapboxgl.accessToken = accessToken

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: initialStyleUrlRef.current,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: -18,
      projection: 'globe',
      attributionControl: true,
      logoPosition: 'bottom-left',
      minZoom: 1.35,
      maxZoom: 20,
      dragRotate: true,
      touchPitch: true,
      cooperativeGestures: false,
    })
    map.scrollZoom.setWheelZoomRate(WHEEL_ZOOM_RATE)

    mapRef.current = map

    const applyAtmosphere = () => {
      map.setFog({
        color: 'rgb(120, 155, 195)',
        'high-color': 'rgb(35, 75, 145)',
        'horizon-blend': 0.025,
        'space-color': 'rgb(2, 18, 35)',
        'star-intensity': 0.68,
      })

      if (!map.getSource(LOW_ZOOM_LABEL_SOURCE)) {
        map.addSource(LOW_ZOOM_LABEL_SOURCE, {
          type: 'geojson',
          data: CONTINENT_LABELS,
        })
      }

      if (!map.getLayer('continent-labels-layer')) {
        map.addLayer({
          id: 'continent-labels-layer',
          type: 'symbol',
          source: LOW_ZOOM_LABEL_SOURCE,
          maxzoom: 3.35,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 1.3, 13, 3.2, 18],
            'text-letter-spacing': 0.02,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': 'rgba(235, 238, 232, 0.68)',
            'text-halo-color': 'rgba(2, 10, 24, 0.82)',
            'text-halo-width': 1.35,
          },
        })
      }
    }

    const clearInteractionRelease = () => {
      if (interactionReleaseTimeoutRef.current !== null) {
        window.clearTimeout(interactionReleaseTimeoutRef.current)
        interactionReleaseTimeoutRef.current = null
      }
    }
    const scheduleInteractionRelease = () => {
      clearInteractionRelease()
      interactionReleaseTimeoutRef.current = window.setTimeout(() => {
        userInteractingRef.current = false
        interactionReleaseTimeoutRef.current = null
      }, 350)
    }

    const markInteracting = (event?: unknown) => {
      const userInitiated = Boolean(
        event && typeof event === 'object' && 'originalEvent' in event && (event as { originalEvent?: Event }).originalEvent,
      )
      if (cameraTransitionRef.current && !userInitiated) return
      if (cameraTransitionRef.current) {
        cameraTransitionRef.current = false
        if (cameraTransitionTimeoutRef.current !== null) {
          window.clearTimeout(cameraTransitionTimeoutRef.current)
          cameraTransitionTimeoutRef.current = null
        }
      }
      clearInteractionRelease()
      userInteractingRef.current = true
      suppressMoveRef.current = false
    }

    const markMoved = () => {
      if (cameraTransitionRef.current) return
      if (!suppressMoveRef.current) {
        setMovedSinceSearch(true)
      }
      scheduleInteractionRelease()
    }

    const canvas = map.getCanvas()
    const markMouseHeld = (event: MouseEvent) => {
      if (event.button !== 0) return
      markInteracting({ originalEvent: event })
    }
    const markTouchHeld = (event: TouchEvent) => {
      // Pause ambient rotation before Mapbox reaches its drag threshold.
      markInteracting({ originalEvent: event })
    }
    const releasePointer = () => scheduleInteractionRelease()

    canvas.addEventListener('mousedown', markMouseHeld)
    canvas.addEventListener('touchstart', markTouchHeld, { passive: true })
    window.addEventListener('mouseup', releasePointer)
    window.addEventListener('touchend', releasePointer, { passive: true })
    window.addEventListener('touchcancel', releasePointer, { passive: true })
    window.addEventListener('blur', releasePointer)

    map.on('load', () => {
      applyAtmosphere()
      setIsReady(true)
      map.resize()
    })
    map.on('style.load', applyAtmosphere)
    map.on('error', () => setError('Αποτυχία φόρτωσης Mapbox map.'))
    map.on('dragstart', markInteracting)
    map.on('zoomstart', markInteracting)
    map.on('rotatestart', markInteracting)
    map.on('pitchstart', markInteracting)
    map.on('moveend', markMoved)

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (rotationFrameRef.current !== null) {
        cancelAnimationFrame(rotationFrameRef.current)
      }
      if (cameraTransitionTimeoutRef.current !== null) {
        window.clearTimeout(cameraTransitionTimeoutRef.current)
      }
      clearInteractionRelease()
      canvas.removeEventListener('mousedown', markMouseHeld)
      canvas.removeEventListener('touchstart', markTouchHeld)
      window.removeEventListener('mouseup', releasePointer)
      window.removeEventListener('touchend', releasePointer)
      window.removeEventListener('touchcancel', releasePointer)
      window.removeEventListener('blur', releasePointer)
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
      initializedRef.current = false
    }
  }, [accessToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || activeStyleUrlRef.current === styleUrl) return

    activeStyleUrlRef.current = styleUrl
    map.setStyle(styleUrl, {
      diff: false,
      localFontFamily: undefined,
      localIdeographFontFamily: undefined,
    })
  }, [isReady, styleUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady || hasReducedMotion()) return

    const rotate = (timestamp: number) => {
      if (!lastRotationTimestampRef.current) {
        lastRotationTimestampRef.current = timestamp
      }

      const elapsed = Math.min(80, timestamp - lastRotationTimestampRef.current)
      lastRotationTimestampRef.current = timestamp

      if (
        !userInteractingRef.current &&
        !cameraTransitionRef.current &&
        !suppressMoveRef.current &&
        document.visibilityState === 'visible' &&
        map.getZoom() <= ROTATION_MAX_ZOOM
      ) {
        const center = map.getCenter()
        map.setCenter([center.lng + (elapsed / 1000) * ROTATION_DEGREES_PER_SECOND, center.lat])
      }

      rotationFrameRef.current = requestAnimationFrame(rotate)
    }

    rotationFrameRef.current = requestAnimationFrame(rotate)

    return () => {
      if (rotationFrameRef.current !== null) {
        cancelAnimationFrame(rotationFrameRef.current)
      }
      rotationFrameRef.current = null
      lastRotationTimestampRef.current = 0
    }
  }, [isReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER)
    if (map.getLayer(CLUSTER_LAYER)) map.removeLayer(CLUSTER_LAYER)
    if (map.getLayer(UNCLUSTERED_LAYER)) map.removeLayer(UNCLUSTERED_LAYER)
    if (map.getSource(CLUSTER_SOURCE)) map.removeSource(CLUSTER_SOURCE)

    if (results.length > 40) {
      map.addSource(CLUSTER_SOURCE, {
        type: 'geojson',
        data: createFeatureCollection(results),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 42,
      })

      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: CLUSTER_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0ea5e9',
          'circle-radius': ['step', ['get', 'point_count'], 18, 12, 24, 36, 32],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: CLUSTER_SOURCE,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: UNCLUSTERED_LAYER,
        type: 'circle',
        source: CLUSTER_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#111827',
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      return
    }

    markersRef.current = results.map((result) => {
      const selected = result.id === selectedResultId
      const element = makeMarkerElement(result, selected)
      element.addEventListener('click', () => onSelectResult(result.id))

      return new mapboxgl.Marker({ element, anchor: 'bottom' })
        .setLngLat(result.coordinates)
        .addTo(map)
    })
  }, [isReady, onSelectResult, results, selectedResultId])

  return {
    containerRef,
    mapRef,
    isReady,
    error: accessToken ? error : 'Λείπει το VITE_MAPBOX_ACCESS_TOKEN.',
    movedSinceSearch,
    acknowledgeSearchLocation,
    fitCoordinates,
    focusResult,
    fitResults,
    getBoundsSnapshot,
  }
}
