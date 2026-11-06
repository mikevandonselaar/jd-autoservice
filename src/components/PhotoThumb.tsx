import { Icon } from './icons'

type PhotoThumbProps = {
  /** Undefined while the URL is not there yet: a plain tile with an image icon. */
  url: string | undefined
  label: string
  onClick: () => void
  className?: string
}

/** A small photo that opens the large view. */
export function PhotoThumb({ url, label, onClick, className = 'h-[60px] w-full' }: PhotoThumbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex flex-none cursor-pointer items-center justify-center overflow-hidden rounded-sm border-2 border-edge bg-divider text-muted ${className}`}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon name="image" className="size-6" strokeWidth={2} />}
    </button>
  )
}

/** A photo that is being saved. */
export function PhotoSaving({ url }: { url: string }) {
  return (
    <div
      role="status"
      aria-label="Foto wordt opgeslagen"
      className="relative flex h-[60px] items-center justify-center overflow-hidden rounded-sm border-2 border-edge bg-canvas"
    >
      <img src={url} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
      <span className="relative size-[22px] animate-spin rounded-full border-[3px] border-edge border-t-charcoal" />
    </div>
  )
}

/** A photo that could not be saved; a tap tries again. */
export function PhotoFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      aria-label="Foto niet opgeslagen, opnieuw proberen"
      className="flex h-[60px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-sm border-2 border-fault bg-fault-tint text-base font-bold text-fault-ink"
    >
      <Icon name="warning" className="size-5 text-fault" strokeWidth={2.6} />
      Opnieuw
    </button>
  )
}
