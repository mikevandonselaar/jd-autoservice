import { useEffect, useId, useRef, useState } from 'react'
import { usePhotoUrls } from '../inspection/photos'
import type { Photo } from '../inspection/types'
import { Button } from './Button'
import { Icon } from './icons'

type PhotoViewerProps = {
  /** The point, for example "Remmen achter". */
  title: string
  /** The block of the point. */
  eyebrow?: string
  photos: Photo[]
  /** Index of the photo to start with. */
  start: number
  onClose: () => void
  /** Only in a draft. Without it there is no delete button. */
  onDelete?: (photo: Photo) => void
}

/** The photos of one point, full screen, one at a time (design M7). Render it only while open. */
export function PhotoViewer({ title, eyebrow, photos, start, onClose, onDelete }: PhotoViewerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [index, setIndex] = useState(start)
  const [asking, setAsking] = useState(false)
  const urlOf = usePhotoUrls(photos.map((photo) => photo.path))

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // The last photo was deleted: nothing left to show.
  useEffect(() => {
    if (photos.length === 0) onClose()
  }, [photos.length, onClose])

  const at = Math.min(index, photos.length - 1)
  const photo = photos[at]
  if (!photo) return null
  const url = urlOf(photo.path)
  const multiple = photos.length > 1

  function step(by: number) {
    setIndex((at + by + photos.length) % photos.length)
    setAsking(false)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (asking) setAsking(false)
        else onClose()
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col border-0 bg-ink p-0 text-white open:flex backdrop:bg-ink"
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
        <header className="flex h-[60px] flex-none items-center gap-3 border-b border-charcoal px-4">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="truncate font-heading text-base font-bold tracking-[0.08em] text-edge uppercase">{eyebrow}</p>
            )}
            <h2 id={titleId} className="truncate font-sans text-lg font-bold tracking-normal normal-case">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="flex size-14 flex-none cursor-pointer items-center justify-center rounded-sm border-2 border-white"
          >
            <Icon name="close" className="size-[18px]" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 p-4">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-charcoal">
            {url ? (
              <img
                src={url}
                alt={`Foto ${at + 1} van ${photos.length}, ${title.toLowerCase()}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Icon name="image" className="size-14 text-edge-open" strokeWidth={1.6} />
            )}
          </div>
          <div className="flex items-center gap-3">
            {multiple && (
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Vorige foto"
                className="flex size-14 flex-none cursor-pointer items-center justify-center rounded-sm border-2 border-white"
              >
                <Icon name="back" className="size-[22px]" />
              </button>
            )}
            <span className="flex-1 text-center text-lg font-bold">
              {at + 1} van {photos.length}
            </span>
            {multiple && (
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Volgende foto"
                className="flex size-14 flex-none cursor-pointer items-center justify-center rounded-sm border-2 border-white"
              >
                <Icon name="next" className="size-[22px]" />
              </button>
            )}
          </div>
        </div>

        {onDelete && (
          <footer className="flex-none border-t border-charcoal px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {asking ? (
              <div className="flex flex-col gap-2.5 rounded-sm bg-surface p-3.5 text-ink">
                <p className="font-semibold">Foto verwijderen? Dit kun je niet terugdraaien.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setAsking(false)}>
                    Annuleren
                  </Button>
                  <Button
                    onClick={() => {
                      setAsking(false)
                      onDelete(photo)
                    }}
                  >
                    Verwijderen
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" className="border-white" onClick={() => setAsking(true)}>
                <Icon name="trash" />
                Verwijderen
              </Button>
            )}
          </footer>
        )}
      </div>
    </dialog>
  )
}
