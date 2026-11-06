import type { ReactNode } from 'react'

const tones = {
  fault: 'border-2 border-fault bg-fault-tint text-fault-ink',
  info: 'border border-divider bg-surface text-ink',
}

type NoticeProps = {
  tone?: keyof typeof tones
  children: ReactNode
}

// Faults are announced right away, info is polite.
export function Notice({ tone = 'info', children }: NoticeProps) {
  return (
    <div
      role={tone === 'fault' ? 'alert' : 'status'}
      className={`rounded-sm px-3.5 py-3 text-base font-semibold ${tones[tone]}`}
    >
      {children}
    </div>
  )
}
