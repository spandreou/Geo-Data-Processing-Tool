import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapBoundsSnapshot, PlaceResult, PlaceSuggestion } from '../types/mapTypes'
import { getStaticThumbnailUrl, haversineDistanceMeters } from '../utils/mapSearchUtils'

const SEARCHBOX_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1'
const SEARCH_TYPES = 'country,region,place,locality,neighborhood,address,poi'

interface SearchBoxSuggestionPayload {
  suggestions?: Array<{
    name?: string
    mapbox_id?: string
    feature_type?: string
    address?: string
    full_address?: string
    place_formatted?: string
    context?: { category?: { name?: string } }
  }>
}

type SearchBoxSuggestion = NonNullable<SearchBoxSuggestionPayload['suggestions']>[number]

interface SearchBoxRetrievePayload {
  features?: Array<{
    geometry?: { coordinates?: [number, number] }
    properties?: {
      name?: string
      mapbox_id?: string
      feature_type?: string
      address?: string
      full_address?: string
      place_formatted?: string
      coordinates?: { longitude?: number; latitude?: number }
      poi_category?: string[]
      context?: { category?: { name?: string } }
    }
  }>
}

function createSessionToken() {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeSuggestionDescription(suggestion: SearchBoxSuggestion) {
  return suggestion.full_address || suggestion.place_formatted || suggestion.address || suggestion.context?.category?.name || ''
}

function buildSuggestUrl({
  query,
  accessToken,
  sessionToken,
  bounds,
}: {
  query: string
  accessToken: string
  sessionToken: string
  bounds?: MapBoundsSnapshot | null
}) {
  const url = new URL(`${SEARCHBOX_BASE_URL}/suggest`)
  url.searchParams.set('q', query)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('session_token', sessionToken)
  url.searchParams.set('language', 'el,en')
  url.searchParams.set('types', SEARCH_TYPES)
  url.searchParams.set('limit', '8')

  if (bounds) {
    url.searchParams.set('bbox', bounds.bbox.join(','))
    url.searchParams.set('proximity', bounds.center.join(','))
  }

  return url
}

async function parseSearchResponse(response: Response) {
  if (response.status === 429) {
    throw new Error('Πάρα πολλά αιτήματα προς το Mapbox. Δοκίμασε ξανά σε λίγο.')
  }

  if (!response.ok) {
    throw new Error('Η αναζήτηση απέτυχε. Έλεγξε τη σύνδεση ή το Mapbox token.')
  }

  return response.json()
}

export function useMapSearch(accessToken: string) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [results, setResults] = useState<PlaceResult[]>([])
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emptyMessage, setEmptyMessage] = useState('')
  const sessionTokenRef = useRef(createSessionToken())
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef('')
  const selectedSuggestionQueryRef = useRef('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const cancelPending = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const retrieveSuggestion = useCallback(
    async (suggestion: PlaceSuggestion, signal?: AbortSignal, bounds?: MapBoundsSnapshot | null): Promise<PlaceResult | null> => {
      const url = new URL(`${SEARCHBOX_BASE_URL}/retrieve/${encodeURIComponent(suggestion.mapboxId)}`)
      url.searchParams.set('access_token', accessToken)
      url.searchParams.set('session_token', sessionTokenRef.current)

      const response = await fetch(url, { signal })
      const payload = (await parseSearchResponse(response)) as SearchBoxRetrievePayload
      const feature = payload.features?.[0]
      const propertyCoordinates = feature?.properties?.coordinates
      const coordinates =
        feature?.geometry?.coordinates ??
        (typeof propertyCoordinates?.longitude === 'number' && typeof propertyCoordinates?.latitude === 'number'
          ? ([propertyCoordinates.longitude, propertyCoordinates.latitude] as [number, number])
          : undefined)

      if (!coordinates) return null

      const category = feature?.properties?.poi_category?.[0] || feature?.properties?.context?.category?.name
      const distanceMeters = bounds ? haversineDistanceMeters(bounds.center, coordinates) : undefined

      return {
        id: suggestion.id,
        mapboxId: suggestion.mapboxId,
        name: feature?.properties?.name || suggestion.name,
        category,
        address: feature?.properties?.full_address || feature?.properties?.place_formatted || feature?.properties?.address || suggestion.description,
        coordinates,
        featureType: feature?.properties?.feature_type || suggestion.featureType,
        distanceMeters,
      }
    },
    [accessToken],
  )

  const fetchSuggestions = useCallback(
    async (value: string, bounds?: MapBoundsSnapshot | null) => {
      const trimmed = value.trim()
      if (selectedSuggestionQueryRef.current) {
        if (selectedSuggestionQueryRef.current === trimmed) {
          setSuggestions([])
          return
        }
        selectedSuggestionQueryRef.current = ''
      }

      if (!accessToken || trimmed.length < 2) {
        setSuggestions([])
        return
      }

      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller

      try {
        const response = await fetch(buildSuggestUrl({ query: trimmed, accessToken, sessionToken: sessionTokenRef.current, bounds }), {
          signal: controller.signal,
        })
        const payload = (await parseSearchResponse(response)) as SearchBoxSuggestionPayload
        if (!mountedRef.current) return

        setError('')
        setSuggestions(
          (payload.suggestions ?? [])
            .filter((suggestion) => suggestion.mapbox_id && suggestion.name)
            .map((suggestion, index) => ({
              id: `${suggestion.mapbox_id}-${index}`,
              mapboxId: suggestion.mapbox_id ?? '',
              name: suggestion.name ?? '',
              description: makeSuggestionDescription(suggestion),
              featureType: suggestion.feature_type || 'poi',
            })),
        )
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return
        if (!mountedRef.current) return
        setSuggestions([])
        setError(fetchError instanceof Error ? fetchError.message : 'Η αναζήτηση απέτυχε.')
      }
    },
    [accessToken],
  )

  const runSearch = useCallback(
    async (value: string, bounds?: MapBoundsSnapshot | null) => {
      const trimmed = value.trim()
      if (!trimmed || !accessToken) return []

      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      setLoading(true)
      setError('')
      setEmptyMessage('')
      lastQueryRef.current = trimmed

      try {
        const response = await fetch(buildSuggestUrl({ query: trimmed, accessToken, sessionToken: sessionTokenRef.current, bounds }), {
          signal: controller.signal,
        })
        const payload = (await parseSearchResponse(response)) as SearchBoxSuggestionPayload
        const nextSuggestions = (payload.suggestions ?? [])
          .filter((suggestion) => suggestion.mapbox_id && suggestion.name)
          .map((suggestion, index) => ({
            id: `${suggestion.mapbox_id}-${index}`,
            mapboxId: suggestion.mapbox_id ?? '',
            name: suggestion.name ?? '',
            description: makeSuggestionDescription(suggestion),
            featureType: suggestion.feature_type || 'poi',
          }))

        const retrieved = await Promise.all(
          nextSuggestions.map((suggestion) => retrieveSuggestion(suggestion, controller.signal, bounds)),
        )
        const nextResults = retrieved
          .filter((result): result is PlaceResult => Boolean(result))
          .map((result) => ({ ...result, thumbnailUrl: getStaticThumbnailUrl(result, accessToken) }))

        if (!mountedRef.current) return []

        setSuggestions([])
        setResults(nextResults)
        setSelectedResultId(nextResults[0]?.id ?? null)
        setEmptyMessage(nextResults.length === 0 ? 'Δεν βρέθηκαν αποτελέσματα σε αυτήν την περιοχή.' : '')
        return nextResults
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return []
        if (!mountedRef.current) return []
        setResults([])
        setSelectedResultId(null)
        setError(fetchError instanceof Error ? fetchError.message : 'Η αναζήτηση απέτυχε.')
        return []
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [accessToken, retrieveSuggestion],
  )

  const selectSuggestion = useCallback(
    async (suggestion: PlaceSuggestion, bounds?: MapBoundsSnapshot | null) => {
      cancelPending()
      setLoading(true)
      setError('')
      setEmptyMessage('')
      selectedSuggestionQueryRef.current = suggestion.name.trim()
      setQuery(suggestion.name)
      lastQueryRef.current = suggestion.name

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const result = await retrieveSuggestion(suggestion, controller.signal, bounds)
        if (!mountedRef.current || !result) return null
        const resultWithThumbnail = { ...result, thumbnailUrl: getStaticThumbnailUrl(result, accessToken) }
        setSuggestions([])
        setResults([resultWithThumbnail])
        setSelectedResultId(resultWithThumbnail.id)
        return resultWithThumbnail
      } catch (fetchError) {
        if ((fetchError as Error).name !== 'AbortError') {
          setError(fetchError instanceof Error ? fetchError.message : 'Η επιλογή απέτυχε.')
        }
        return null
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    },
    [accessToken, cancelPending, retrieveSuggestion],
  )

  const clearSearch = useCallback(() => {
    cancelPending()
    setQuery('')
    setSuggestions([])
    setResults([])
    setSelectedResultId(null)
    setError('')
    setEmptyMessage('')
    lastQueryRef.current = ''
    selectedSuggestionQueryRef.current = ''
  }, [cancelPending])

  const hasSearchContext = query.trim().length > 0 || results.length > 0

  return {
    query,
    setQuery,
    suggestions,
    results,
    setResults,
    selectedResultId,
    setSelectedResultId,
    loading,
    error,
    emptyMessage,
    lastQueryRef,
    hasSearchContext,
    fetchSuggestions,
    runSearch,
    selectSuggestion,
    clearSearch,
  }
}
