import { Button } from './Button'
import { Notice } from './Notice'

export function Loading() {
  return (
    <p role="status" className="py-8 text-center text-muted">
      Laden…
    </p>
  )
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <Notice tone="fault">Laden lukt nu niet. Controleer je verbinding en probeer het opnieuw.</Notice>
      <Button variant="secondary" onClick={onRetry}>
        Opnieuw proberen
      </Button>
    </>
  )
}
