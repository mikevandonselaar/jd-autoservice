import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from './icons'

type BottomSheetProps = {
  title: string
  /** Small line above the title, for example the block of the point. */
  eyebrow?: string
  onClose: () => void
  /** Pinned under the scrolling content, usually the save button. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * A modal sheet from the bottom, at most 480px wide. Render it only while it is open.
 * The native dialog traps focus, closes on Escape and makes the page behind it inert.
 */
export function BottomSheet({ title, eyebrow, onClose, footer, children }: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // A click on the dim area lands on the dialog itself, not on the sheet content.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="mx-auto mt-auto mb-0 max-h-[calc(100dvh-52px)] w-full max-w-[480px] flex-col overflow-hidden rounded-t-xl border-0 bg-surface p-0 text-ink open:flex backdrop:bg-ink/55"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pt-2 pb-3">
        <span aria-hidden="true" className="h-1 w-11 flex-none self-center rounded-sm bg-edge" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="font-heading text-base font-bold tracking-[0.08em] text-muted uppercase">{eyebrow}</p>
            )}
            <h2 id={titleId} className="text-xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="flex size-14 flex-none cursor-pointer items-center justify-center rounded-sm border-2 border-charcoal bg-surface text-charcoal"
          >
            <Icon name="close" className="size-[18px]" />
          </button>
        </div>
        {children}
      </div>
      {footer && <div className="flex-none px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </dialog>
  )
}
