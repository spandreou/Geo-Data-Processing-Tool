import type { PlaceResult } from '../types/mapTypes'
import { PlaceResultCard } from './PlaceResultCard'

export function SearchResultsCarousel({
  results,
  selectedResultId,
  onSelectResult,
}: {
  results: PlaceResult[]
  selectedResultId: string | null
  onSelectResult: (id: string) => void
}) {
  if (results.length === 0) return null

  return (
    <section className="globe-results" aria-label="Αποτελέσματα αναζήτησης">
      {results.map((result) => (
        <PlaceResultCard
          key={result.id}
          result={result}
          selected={result.id === selectedResultId}
          onSelect={() => onSelectResult(result.id)}
        />
      ))}
    </section>
  )
}
