import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlobeMapExperience from './GlobeMapExperience'

type Handler = (...args: unknown[]) => void
interface MockMapInstance {
  canvas: HTMLCanvasElement
  center: { lng: number; lat: number }
  emitLayer: (event: string, layerId: string, payload?: unknown) => void
  fitBounds: ReturnType<typeof vi.fn>
  layers: Map<string, Record<string, unknown>>
  removed: boolean
  sources: Map<string, { definition: Record<string, unknown>; data: unknown; setData: ReturnType<typeof vi.fn> }>
  zoom: number
  scrollZoom: { setWheelZoomRate: ReturnType<typeof vi.fn> }
  setCenter: ReturnType<typeof vi.fn>
  setStyle: ReturnType<typeof vi.fn>
  emit: (event: string, payload?: unknown) => void
}

interface MockMarkerInstance {
  removed: boolean
}

const { mapInstances, markerInstances, MockMap, MockMarker, MockLngLatBounds } = vi.hoisted(() => {
  const hoistedMapInstances: MockMapInstance[] = []
  const hoistedMarkerInstances: MockMarkerInstance[] = []

  class HoistedMockLngLatBounds {
    points: [number, number][] = []

    extend(point: [number, number]) {
      this.points.push(point)
      return this
    }
  }

  class HoistedMockMarker {
    element: HTMLElement
    removed = false
    lngLat: [number, number] | null = null

    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      hoistedMarkerInstances.push(this)
    }

    setLngLat(lngLat: [number, number]) {
      this.lngLat = lngLat
      return this
    }

    addTo() {
      return this
    }

    remove() {
      this.removed = true
    }
  }

  class HoistedMockMap {
    handlers = new Map<string, Handler[]>()
    canvas = document.createElement('canvas')
    center = { lng: 22.2, lat: 43.8 }
    zoom = 1.72
    removed = false
    sources = new Map<string, { definition: Record<string, unknown>; data: unknown; setData: ReturnType<typeof vi.fn> }>()
    layers = new Map<string, Record<string, unknown>>()
    scrollZoom = { setWheelZoomRate: vi.fn() }

    constructor() {
      hoistedMapInstances.push(this)
      queueMicrotask(() => this.emit('load'))
    }

    on(event: string, layerOrHandler: string | Handler, maybeHandler?: Handler) {
      const layerId = typeof layerOrHandler === 'string' ? layerOrHandler : null
      const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler
      if (!handler) return this

      const key = layerId ? `${event}:${layerId}` : event
      const handlers = this.handlers.get(key) ?? []
      handlers.push(handler)
      this.handlers.set(key, handlers)
      return this
    }

    once(event: string, handler: Handler) {
      return this.on(event, handler)
    }

    off(event: string, layerOrHandler: string | Handler, maybeHandler?: Handler) {
      const layerId = typeof layerOrHandler === 'string' ? layerOrHandler : null
      const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler
      const key = layerId ? `${event}:${layerId}` : event
      if (!handler) return this
      this.handlers.set(key, (this.handlers.get(key) ?? []).filter((candidate) => candidate !== handler))
      return this
    }

    emit(event: string, payload?: unknown) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload)
      }
    }

    emitLayer(event: string, layerId: string, payload?: unknown) {
      for (const handler of this.handlers.get(`${event}:${layerId}`) ?? []) {
        handler(payload)
      }
    }

    setFog = vi.fn()
    resize = vi.fn()
    remove = vi.fn(() => {
      this.removed = true
    })

    getBounds() {
      return {
        getWest: () => 19,
        getSouth: () => 34,
        getEast: () => 29,
        getNorth: () => 42,
      }
    }

    getCenter() {
      return this.center
    }

    getCanvas() {
      return this.canvas
    }

    getZoom() {
      return this.zoom
    }

    setCenter = vi.fn((center: [number, number]) => {
      this.center = { lng: center[0], lat: center[1] }
    })

    setStyle = vi.fn(() => {
      this.sources.clear()
      this.layers.clear()
      queueMicrotask(() => this.emit('style.load'))
    })

    flyTo(options: { center: [number, number]; zoom?: number }) {
      this.emit('zoomstart')
      this.center = { lng: options.center[0], lat: options.center[1] }
      this.zoom = options.zoom ?? this.zoom
      this.emit('moveend')
    }

    fitBounds = vi.fn()

    addSource(id: string, definition: Record<string, unknown>) {
      const source = {
        definition,
        data: definition.data,
        setData: vi.fn((data: unknown) => {
          source.data = data
        }),
      }
      this.sources.set(id, source)
    }

    getSource(id: string) {
      return this.sources.get(id)
    }

    removeSource(id: string) {
      this.sources.delete(id)
    }

    addLayer(layer: { id: string } & Record<string, unknown>) {
      this.layers.set(layer.id, layer)
    }

    getLayer(id: string) {
      return this.layers.get(id)
    }

    removeLayer(id: string) {
      this.layers.delete(id)
    }
  }

  return {
    mapInstances: hoistedMapInstances,
    markerInstances: hoistedMarkerInstances,
    MockMap: HoistedMockMap,
    MockMarker: HoistedMockMarker,
    MockLngLatBounds: HoistedMockLngLatBounds,
  }
})

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    supported: () => true,
    Map: MockMap,
    Marker: MockMarker,
    LngLatBounds: MockLngLatBounds,
  },
}))

function mockSearchFetch(mode: 'success' | 'empty' | 'error' = 'success') {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (mode === 'error') {
      return new Response(JSON.stringify({ message: 'fail' }), { status: 500 })
    }

    if (url.includes('/suggest')) {
      return Response.json({
        suggestions:
          mode === 'empty'
            ? []
            : [
                {
                  name: 'Palude Taverna',
                  mapbox_id: 'poi.1',
                  feature_type: 'poi',
                  place_formatted: 'Thasos, Greece',
                  context: { category: { name: 'Greek restaurant' } },
                },
              ],
      })
    }

    return Response.json({
      features: [
        {
          geometry: { coordinates: [24.709, 40.778] },
          properties: {
            name: 'Palude Taverna',
            mapbox_id: 'poi.1',
            feature_type: 'poi',
            place_formatted: 'Thasos, Greece',
            poi_category: ['Greek restaurant'],
          },
        },
      ],
    })
  })
}

describe('GlobeMapExperience', () => {
  beforeEach(() => {
    mapInstances.length = 0
    markerInstances.length = 0
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test')
    globalThis.fetch = mockSearchFetch() as typeof fetch
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a clear missing-token state without creating a map', () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')

    render(<GlobeMapExperience onBack={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('VITE_MAPBOX_ACCESS_TOKEN')
    expect(mapInstances).toHaveLength(0)
  })

  it('configures a responsive mouse-wheel zoom rate', async () => {
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    expect(mapInstances[0]?.scrollZoom.setWheelZoomRate).toHaveBeenCalledWith(1 / 180)
  })

  it('marks bottom search controls as obscured while an operational panel is open', async () => {
    const { container } = render(<GlobeMapExperience onBack={vi.fn()} controlsObscured />)

    await waitFor(() => expect(mapInstances).toHaveLength(1))
    expect(container.querySelector('.globe-bottom-ui')).toHaveClass('globe-bottom-ui--obscured')
  })

  it('switches Mapbox styles with the application theme and restores operational layers', async () => {
    const cluster = {
      id: 'cluster-1',
      centroidLatitude: 37.98,
      centroidLongitude: 23.72,
      pointCount: 8,
      averageValue: 120,
    }
    const view = render(
      <GlobeMapExperience onBack={vi.fn()} theme="dark" viewMode="sandbox" clusters={[cluster]} />,
    )

    await waitFor(() => expect(mapInstances[0]?.sources.has('sandbox-clusters-source')).toBe(true))
    view.rerender(
      <GlobeMapExperience onBack={vi.fn()} theme="light" viewMode="sandbox" clusters={[cluster]} />,
    )

    await waitFor(() => {
      expect(mapInstances[0]?.setStyle).toHaveBeenCalledWith(
        'mapbox://styles/mapbox/navigation-day-v1',
        expect.objectContaining({ diff: false }),
      )
    })
    await waitFor(() => expect(mapInstances[0]?.sources.has('sandbox-clusters-source')).toBe(true))
  })

  it('renders backend clusters as native unclustered Mapbox layers and fits their bounds', async () => {
    render(
      <GlobeMapExperience
        onBack={vi.fn()}
        viewMode="sandbox"
        clusters={[
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
        ]}
        outlierClusterIds={['cluster-2']}
        selectedClusterId="cluster-1"
        onSelectCluster={vi.fn()}
      />,
    )

    await waitFor(() => expect(mapInstances[0]?.sources.has('sandbox-clusters-source')).toBe(true))
    const map = mapInstances[0]
    const source = map?.sources.get('sandbox-clusters-source')

    expect(source?.definition).not.toHaveProperty('cluster')
    expect(source?.data).toMatchObject({
      type: 'FeatureCollection',
      features: [
        { properties: { id: 'cluster-1', isSelected: true, isOutlier: false } },
        { properties: { id: 'cluster-2', isSelected: false, isOutlier: true } },
      ],
    })
    expect(map?.layers.has('sandbox-clusters-circles')).toBe(true)
    expect(map?.layers.has('sandbox-clusters-count')).toBe(true)
    expect(map?.fitBounds).toHaveBeenCalled()
  })

  it('renders one feature per visible property and forwards map selections', async () => {
    const onSelectProperty = vi.fn()
    render(
      <GlobeMapExperience
        onBack={vi.fn()}
        viewMode="market"
        properties={[
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
        ]}
        selectedPropertyId={7}
        onSelectProperty={onSelectProperty}
      />,
    )

    await waitFor(() => expect(mapInstances[0]?.sources.has('real-estate-properties-source')).toBe(true))
    const map = mapInstances[0]
    expect(map?.sources.get('real-estate-properties-source')?.data).toMatchObject({
      features: [{ properties: { id: 7, isSelected: true } }],
    })
    expect(map?.layers.has('real-estate-properties-circles')).toBe(true)

    act(() => {
      map?.emitLayer('click', 'real-estate-properties-circles', {
        features: [{ properties: { id: 7 } }],
      })
    })
    expect(onSelectProperty).toHaveBeenCalledWith(7)
  })

  it('restores operational layers after a Mapbox style reload', async () => {
    render(
      <GlobeMapExperience
        onBack={vi.fn()}
        viewMode="sandbox"
        clusters={[
          {
            id: 'cluster-1',
            centroidLatitude: 37.98,
            centroidLongitude: 23.72,
            pointCount: 8,
            averageValue: 120,
          },
        ]}
        onSelectCluster={vi.fn()}
      />,
    )

    await waitFor(() => expect(mapInstances[0]?.sources.has('sandbox-clusters-source')).toBe(true))
    const map = mapInstances[0]
    map?.sources.clear()
    map?.layers.clear()

    act(() => map?.emit('style.load'))

    await waitFor(() => expect(map?.sources.has('sandbox-clusters-source')).toBe(true))
    expect(map?.layers.has('sandbox-clusters-circles')).toBe(true)
  })

  it('pauses automatic rotation as soon as the primary mouse button is held', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0))
    const map = mapInstances[0]
    if (!map) throw new Error('Map was not created')
    map.setCenter.mockClear()

    act(() => {
      map.emit('moveend')
      map.canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    })
    act(() => animationFrames.at(-1)?.(1000))

    expect(map.setCenter).not.toHaveBeenCalled()
  })

  it('pauses automatic rotation as soon as a touch starts on the map', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await waitFor(() => expect(animationFrames.length).toBeGreaterThan(0))
    const map = mapInstances[0]
    if (!map) throw new Error('Map was not created')
    map.setCenter.mockClear()

    act(() => {
      map.emit('moveend')
      map.canvas.dispatchEvent(new Event('touchstart', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    })
    act(() => animationFrames.at(-1)?.(1000))

    expect(map.setCenter).not.toHaveBeenCalled()
  })

  it('searches, selects a suggestion, renders a card, and creates a marker', async () => {
    const user = userEvent.setup()
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')

    expect(await screen.findByRole('option', { name: /Palude Taverna/i })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Palude Taverna/i }))

    expect(await screen.findByRole('button', { name: /Palude Taverna/i })).toBeInTheDocument()
    await waitFor(() => expect(markerInstances).toHaveLength(1))
    expect(mapInstances[0]?.center).toEqual({ lng: 24.709, lat: 40.778 })
  })

  it('keeps suggestions closed after selecting a place', async () => {
    const user = userEvent.setup()
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')
    await user.click(await screen.findByRole('option', { name: /Palude Taverna/i }))
    await screen.findByRole('button', { name: /Palude Taverna/i })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
    })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('accepts async search responses after StrictMode effect replay', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <GlobeMapExperience onBack={vi.fn()} />
      </StrictMode>,
    )

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')

    expect(await screen.findByRole('option', { name: /Palude Taverna/i })).toBeInTheDocument()
  })

  it('pauses automatic rotation while focusing a selected place', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const user = userEvent.setup()
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')
    await user.click(await screen.findByRole('option', { name: /Palude Taverna/i }))

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
    })

    const map = mapInstances[0]
    expect(animationFrames.length).toBeGreaterThan(0)
    if (!map) throw new Error('Map was not created')
    map.zoom = 1.72
    map.setCenter.mockClear()

    act(() => animationFrames.at(-1)?.(1000))

    expect(map.setCenter).not.toHaveBeenCalled()
  })

  it('shows search-this-area after map movement and reuses the last query', async () => {
    const user = userEvent.setup()
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')
    await user.click(await screen.findByRole('option', { name: /Palude Taverna/i }))

    act(() => {
      mapInstances[0]?.emit('dragstart', { originalEvent: new Event('pointerdown') })
      mapInstances[0]?.emit('moveend')
    })

    const areaButton = await screen.findByRole('button', { name: /Αναζήτηση στην τρέχουσα περιοχή/i })
    await user.click(areaButton)

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4))
  })

  it('renders empty and error search states', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockSearchFetch('empty') as typeof fetch
    render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'zzzz')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Δεν βρέθηκαν αποτελέσματα σε αυτήν την περιοχή.')).toBeInTheDocument()

    globalThis.fetch = mockSearchFetch('error') as typeof fetch
    await user.clear(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'))
    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'athens')
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/Η αναζήτηση απέτυχε/i)).toBeInTheDocument()
  })

  it('cleans up the map and markers on unmount', async () => {
    const user = userEvent.setup()
    const view = render(<GlobeMapExperience onBack={vi.fn()} />)

    await user.type(screen.getByLabelText('Αναζήτηση σε αυτήν την περιοχή'), 'taverna')
    await user.click(await screen.findByRole('option', { name: /Palude Taverna/i }))
    await waitFor(() => expect(markerInstances).toHaveLength(1))

    view.unmount()

    expect(mapInstances[0]?.removed).toBe(true)
    expect(markerInstances[0]?.removed).toBe(true)
  })
})
