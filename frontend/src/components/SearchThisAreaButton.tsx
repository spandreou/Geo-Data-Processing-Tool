import { LoaderCircle } from 'lucide-react'

export function SearchThisAreaButton({
  visible,
  loading,
  disabled,
  onClick,
}: {
  visible: boolean
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  if (!visible) return null

  return (
    <button
      type="button"
      className="globe-area-button"
      disabled={disabled || loading}
      onClick={onClick}
      aria-label="Αναζήτηση στην τρέχουσα περιοχή του χάρτη"
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {loading ? 'Αναζήτηση...' : 'Αναζήτηση εδώ'}
    </button>
  )
}
