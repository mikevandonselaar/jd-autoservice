import { tileLabel } from '../inspection/rules'
import type { InspectionItem, ItemStatus } from '../inspection/types'
import { Icon, type IconName } from './icons'

// Colour and icon per result. Red is only for a fault; a repair counts as good.
const looks: Record<ItemStatus, { box: string; text: string; icon: IconName | null }> = {
  open: { box: 'border-2 border-dashed border-edge-open bg-surface', text: 'text-muted', icon: null },
  ok: { box: 'border-2 border-good bg-good-tint', text: 'text-good-ink', icon: 'check' },
  repaired: { box: 'border-2 border-good bg-good-tint', text: 'text-good-ink', icon: 'wrench' },
  advice: { box: 'border-2 border-advice bg-advice-tint', text: 'text-advice-ink', icon: 'clock' },
  fault: { box: 'border-[3px] border-fault bg-fault-tint', text: 'text-fault-ink', icon: 'warning' },
}

type StatusTileProps = {
  item: InspectionItem
  /** The point got advice at the previous visit. */
  earlierAdvice: boolean
  onTap: () => void
}

/** One point of the checklist. A tap moves it on: open, good, not good. */
export function StatusTile({ item, earlierAdvice, onTap }: StatusTileProps) {
  const look = looks[item.status]
  const label = tileLabel(item)
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${item.label}: ${label}${earlierAdvice ? ', eerder advies' : ''}`}
      className={`flex min-h-[60px] min-w-0 cursor-pointer flex-col items-start justify-between gap-1 rounded-sm px-2.5 py-2 text-left ${look.box}`}
    >
      <b className="max-w-full text-base leading-tight font-bold break-words hyphens-auto">{item.label}</b>
      <span className={`flex items-center gap-1 text-base font-semibold ${look.text}`}>
        {look.icon && <Icon name={look.icon} className="size-4" strokeWidth={2.8} />}
        {label}
      </span>
      {earlierAdvice && <span className="text-base font-semibold text-advice-ink">Eerder advies</span>}
    </button>
  )
}
