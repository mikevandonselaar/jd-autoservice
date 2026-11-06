import { termLabel } from '../inspection/rules'
import type { AdviceTerm, ItemStatus } from '../inspection/types'

type FindingBadgeProps = {
  status: ItemStatus
  term: AdviceTerm | null
  className?: string
}

/** What was decided about a point: "Nu" for a fault, the term for an advice, or "Gerepareerd". */
export function FindingBadge({ status, term, className = '' }: FindingBadgeProps) {
  const [text, colours] =
    status === 'fault'
      ? ['Nu', 'border-fault bg-fault text-white']
      : status === 'advice'
        ? [term ? termLabel[term] : 'Advies', 'border-advice bg-advice-tint text-advice-ink']
        : ['Gerepareerd', 'border-good bg-good-tint text-good-ink']
  return (
    <span
      className={`flex min-h-[30px] flex-none items-center justify-center rounded-sm border-2 p-0.5 text-center text-base leading-tight font-bold ${colours} ${className}`}
    >
      {text}
    </span>
  )
}
