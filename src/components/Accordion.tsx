import { useId, type ReactNode } from 'react'
import { Icon } from './icons'

type AccordionProps = {
  title: string
  /** Number or check mark in the square before the title. */
  badge: ReactNode
  /** The badge is filled green, for a finished block. */
  complete?: boolean
  /** Extra marker between title and count, for example "2 eerder". */
  marker?: ReactNode
  count: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** A block of the checklist: a header button that opens its panel. */
export function Accordion({ title, badge, complete = false, marker, count, open, onToggle, children }: AccordionProps) {
  const panelId = useId()
  return (
    <section className="border-b border-divider last:border-b-0">
      <h3 className="text-base tracking-[0.04em]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[60px] w-full cursor-pointer items-center gap-2.5 bg-surface px-4 text-left uppercase"
        >
          <span
            className={`flex size-[30px] flex-none items-center justify-center rounded-sm text-base font-bold ${
              complete || open ? (complete ? 'bg-good text-white' : 'bg-charcoal text-white') : 'bg-canvas'
            }`}
          >
            {badge}
          </span>
          <span className="min-w-0 flex-1">{title}</span>
          {marker}
          <span className="font-sans text-base font-bold tracking-normal">{count}</span>
          <Icon name={open ? 'up' : 'down'} className="size-[18px] text-charcoal" />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="flex flex-col gap-2.5 bg-surface px-4 pt-1 pb-3.5">
        {children}
      </div>
    </section>
  )
}
