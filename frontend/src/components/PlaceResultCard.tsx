import { MapPin, Star } from 'lucide-react'
import type { PlaceResult } from '../types/mapTypes'
import { formatDistance } from '../utils/mapSearchUtils'

export function PlaceResultCard({
  result,
  selected,
  onSelect,
}: {
  result: PlaceResult
  selected: boolean
  onSelect: () => void
}) {
  const distance = formatDistance(result.distanceMeters)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`globe-result-card ${selected ? 'globe-result-card--selected' : ''}`}
    >
      <span className="globe-result-thumb" aria-hidden="true">
        {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" loading="lazy" /> : <MapPin className="h-7 w-7" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px] font-bold leading-tight text-white">{result.name}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-white">
          {typeof result.rating === 'number' && (
            <>
              <Star className="h-3.5 w-3.5 fill-white text-white" />
              <span>{result.rating.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="truncate">{result.category || result.featureType}</span>
        </span>
        {(distance || result.address) && (
          <span className="mt-0.5 block truncate text-[13px] text-emerald-300">{distance || result.address}</span>
        )}
      </span>
    </button>
  )
}
