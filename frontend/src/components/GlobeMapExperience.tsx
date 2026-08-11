import { useCallback, useEffect } from 'react'
import { useMapboxMap } from '../hooks/useMapboxMap'
import { useMapboxOperationalLayers } from '../hooks/useMapboxOperationalLayers'
import { useMapSearch } from '../hooks/useMapSearch'
import type { MapViewMode, RealEstateProperty, SandboxCluster } from '../types/mapTypes'
import { getZoomForFeatureType } from '../utils/mapSearchUtils'
import { MapSearchOverlay } from './MapSearchOverlay'
import { SearchResultsCarousel } from './SearchResultsCarousel'
import { SearchThisAreaButton } from './SearchThisAreaButton'

const EMPTY_CLUSTERS: SandboxCluster[] = []
const EMPTY_PROPERTIES: RealEstateProperty[] = []
const EMPTY_OUTLIERS: string[] = []
const NOOP_CLUSTER_SELECT = () => undefined
const NOOP_PROPERTY_SELECT = () => undefined

interface GlobeMapExperienceProps {
  onBack?: () => void
  theme?: 'light' | 'dark'
  viewMode?: MapViewMode
  clusters?: SandboxCluster[]
  outlierClusterIds?: string[]
  selectedClusterId?: string | null
  properties?: RealEstateProperty[]
  selectedPropertyId?: number | null
  onSelectCluster?: (id: string) => void
  onSelectProperty?: (id: number) => void
  controlsObscured?: boolean
}

export default function GlobeMapExperience({
  theme = 'dark',
  viewMode = 'sandbox',
  clusters = EMPTY_CLUSTERS,
  outlierClusterIds = EMPTY_OUTLIERS,
  selectedClusterId = null,
  properties = EMPTY_PROPERTIES,
  selectedPropertyId = null,
  onSelectCluster = NOOP_CLUSTER_SELECT,
  onSelectProperty = NOOP_PROPERTY_SELECT,
  controlsObscured = false,
}: GlobeMapExperienceProps) {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''
  const {
    query,
    setQuery,
    suggestions,
    results,
    selectedResultId,
    setSelectedResultId,
    loading,
    error: searchError,
    emptyMessage,
    lastQueryRef,
    hasSearchContext,
    fetchSuggestions,
    runSearch,
    selectSuggestion,
    clearSearch,
  } = useMapSearch(accessToken)

  const handleMarkerSelect = useCallback((id: string) => {
    setSelectedResultId(id)
  }, [setSelectedResultId])

  const mapApi = useMapboxMap({
    accessToken,
    styleUrl:
      theme === 'light'
        ? 'mapbox://styles/mapbox/navigation-day-v1'
        : 'mapbox://styles/mapbox/navigation-night-v1',
    results,
    selectedResultId,
    onSelectResult: handleMarkerSelect,
  })
  const {
    acknowledgeSearchLocation,
    containerRef,
    error: mapError,
    fitCoordinates,
    fitResults,
    focusResult,
    getBoundsSnapshot,
    movedSinceSearch,
  } = mapApi

  useMapboxOperationalLayers({
    mapRef: mapApi.mapRef,
    isReady: mapApi.isReady,
    viewMode,
    clusters,
    outlierClusterIds,
    selectedClusterId,
    properties,
    selectedPropertyId,
    onSelectCluster,
    onSelectProperty,
    fitCoordinates,
  })

  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null

  useEffect(() => {
    if (selectedResult) {
      focusResult(selectedResult, { zoom: getZoomForFeatureType(selectedResult.featureType), markClean: false })
    }
  }, [focusResult, selectedResult])

  const handleRunSearch = useCallback(
    async (value: string, bounds = getBoundsSnapshot()) => {
      const nextResults = await runSearch(value, bounds)
      acknowledgeSearchLocation()
      fitResults(nextResults)
    },
    [acknowledgeSearchLocation, fitResults, getBoundsSnapshot, runSearch],
  )

  const handleSelectSuggestion = useCallback(
    async (suggestion: Parameters<typeof selectSuggestion>[0], bounds = getBoundsSnapshot()) => {
      const result = await selectSuggestion(suggestion, bounds)
      if (result) {
        focusResult(result)
      }
    },
    [focusResult, getBoundsSnapshot, selectSuggestion],
  )

  const handleSearchThisArea = useCallback(() => {
    const lastQuery = lastQueryRef.current.trim()
    if (!lastQuery) return
    void handleRunSearch(lastQuery, getBoundsSnapshot())
  }, [getBoundsSnapshot, handleRunSearch, lastQueryRef])

  const handleSelectResult = useCallback(
    (id: string) => {
      setSelectedResultId(id)
      const result = results.find((item) => item.id === id)
      if (result) {
        focusResult(result, { markClean: false })
      }
    },
    [focusResult, results, setSelectedResultId],
  )

  return (
    <main
      className={`globe-page${controlsObscured ? ' globe-page--controls-obscured' : ''}`}
      aria-label="Διαδραστικός χάρτης υδρογείου"
    >
      <div ref={containerRef} className="globe-map" data-testid="globe-map" />

      {(mapError || !accessToken) && (
        <div className="globe-token-panel" role="alert">
          <strong>Ο χάρτης χρειάζεται Mapbox token.</strong>
          <span>Πρόσθεσε `VITE_MAPBOX_ACCESS_TOKEN` στο local `.env` του frontend.</span>
        </div>
      )}

      <SearchThisAreaButton
        visible={movedSinceSearch && hasSearchContext}
        loading={loading}
        disabled={!hasSearchContext}
        onClick={handleSearchThisArea}
      />

      <div className={`globe-bottom-ui${controlsObscured ? ' globe-bottom-ui--obscured' : ''}`}>
        <SearchResultsCarousel results={results} selectedResultId={selectedResultId} onSelectResult={handleSelectResult} />
        <MapSearchOverlay
          query={query}
          suggestions={suggestions}
          loading={loading}
          error={searchError || mapError}
          emptyMessage={emptyMessage}
          onQueryChange={setQuery}
          onFetchSuggestions={fetchSuggestions}
          onSubmit={(value, bounds) => void handleRunSearch(value, bounds)}
          onSelectSuggestion={(suggestion, bounds) => void handleSelectSuggestion(suggestion, bounds)}
          onClear={clearSearch}
          getBoundsSnapshot={getBoundsSnapshot}
        />
      </div>
    </main>
  )
}
