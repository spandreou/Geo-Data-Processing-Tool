import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Mic, Search, X } from 'lucide-react'
import type { MapBoundsSnapshot, PlaceSuggestion } from '../types/mapTypes'

export function MapSearchOverlay({
  query,
  suggestions,
  loading,
  error,
  emptyMessage,
  onQueryChange,
  onFetchSuggestions,
  onSubmit,
  onSelectSuggestion,
  onClear,
  getBoundsSnapshot,
}: {
  query: string
  suggestions: PlaceSuggestion[]
  loading: boolean
  error: string
  emptyMessage: string
  onQueryChange: (query: string) => void
  onFetchSuggestions: (query: string, bounds?: MapBoundsSnapshot | null) => void
  onSubmit: (query: string, bounds?: MapBoundsSnapshot | null) => void
  onSelectSuggestion: (suggestion: PlaceSuggestion, bounds?: MapBoundsSnapshot | null) => void
  onClear: () => void
  getBoundsSnapshot: () => MapBoundsSnapshot | null
}) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = 'globe-search-suggestions'
  const showSuggestions = suggestions.length > 0

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onFetchSuggestions(query, getBoundsSnapshot())
    }, 260)

    return () => window.clearTimeout(timer)
  }, [getBoundsSnapshot, onFetchSuggestions, query])

  const activeDescendant = useMemo(
    () => (activeIndex >= 0 && activeIndex < suggestions.length ? `${listboxId}-${activeIndex}` : undefined),
    [activeIndex, suggestions.length],
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const activeSuggestion = activeIndex >= 0 ? suggestions[activeIndex] : undefined
    if (activeSuggestion) {
      onSelectSuggestion(activeSuggestion, getBoundsSnapshot())
      return
    }

    onSubmit(query, getBoundsSnapshot())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setActiveIndex(-1)
      inputRef.current?.blur()
      return
    }

    if (!showSuggestions) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % suggestions.length)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1))
    }
  }

  return (
    <div className="globe-search-shell">
      {(error || emptyMessage) && (
        <div className={`globe-search-message ${error ? 'globe-search-message--error' : ''}`} role="status">
          {error || emptyMessage}
        </div>
      )}

      <form className="globe-search-bar" onSubmit={handleSubmit} role="search">
        <Search className="h-5 w-5 shrink-0 text-zinc-300" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Αναζήτηση σε αυτήν την περιοχή"
          aria-label="Αναζήτηση σε αυτήν την περιοχή"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          className="globe-search-input"
        />
        {loading && <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-zinc-300" aria-label="Φόρτωση" />}
        {query && !loading && (
          <button type="button" className="globe-icon-button" onClick={onClear} aria-label="Καθαρισμός αναζήτησης">
            <X className="h-5 w-5" />
          </button>
        )}
        <button type="button" className="globe-icon-button" aria-label="Φωνητική αναζήτηση μη διαθέσιμη" disabled>
          <Mic className="h-5 w-5" />
        </button>
      </form>

      {showSuggestions && (
        <div id={listboxId} role="listbox" className="globe-suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={`globe-suggestion ${activeIndex === index ? 'globe-suggestion--active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelectSuggestion(suggestion, getBoundsSnapshot())}
            >
              <span className="truncate font-semibold text-white">{suggestion.name}</span>
              {suggestion.description && <span className="truncate text-xs text-zinc-400">{suggestion.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
