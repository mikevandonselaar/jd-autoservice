import { formatNumber } from '../lib/format'
import type { ReadingState } from '../inspection/rules'

const looks: Record<ReadingState, string> = {
  empty: 'border-2 border-dashed border-edge-open bg-surface',
  ok: 'border-2 border-good bg-good-tint',
  advice: 'border-2 border-advice bg-advice-tint',
  fault: 'border-[3px] border-fault bg-fault-tint',
}

const stateText: Record<ReadingState, string> = {
  empty: 'nog niet gemeten',
  ok: 'goed',
  advice: 'advies',
  fault: 'fout',
}

type MeasureCardProps = {
  label: string
  value: number | null
  unit: string
  state: ReadingState
  onTap: () => void
}

/** One measurement in the strip on top of the checklist. Colour follows the limits. */
export function MeasureCard({ label, value, unit, state, onTap }: MeasureCardProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${label}: ${value === null ? stateText.empty : `${formatNumber(value)} ${unit}, ${stateText[state]}`}`}
      className={`flex min-h-[66px] w-32 flex-none cursor-pointer flex-col items-start justify-between rounded-sm px-2 py-1.5 text-left text-ink ${looks[state]}`}
    >
      <span
        className={`line-clamp-2 w-full text-base leading-tight font-bold break-words hyphens-auto ${state === 'fault' ? 'text-fault-ink' : 'text-muted'}`}
      >
        {label}
      </span>
      <span className="text-[22px] font-bold">
        {value === null ? (
          <span className="text-muted">–</span>
        ) : (
          <>
            {formatNumber(value)} <span className="text-base font-semibold text-muted">{unit}</span>
          </>
        )}
      </span>
    </button>
  )
}
