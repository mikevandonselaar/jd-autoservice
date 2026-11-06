import type { ReactNode } from 'react'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 font-heading text-base font-bold tracking-[0.08em] text-charcoal uppercase">
      <span
        aria-hidden="true"
        className="size-[11px] flex-none bg-brand [transform:skewX(-18deg)_rotate(-8deg)]"
      />
      {children}
    </p>
  )
}
