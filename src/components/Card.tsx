import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-divider bg-surface ${className}`}>{children}</div>
}

/** A row inside a Card: label on the left, value on the right. */
export function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-2.5 border-b border-divider px-3.5 last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}
