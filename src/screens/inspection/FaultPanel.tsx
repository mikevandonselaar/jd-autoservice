import { useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { OptionButton } from '../../components/OptionButton'
import { PhotoFailed, PhotoSaving, PhotoThumb } from '../../components/PhotoThumb'
import { PhotoViewer } from '../../components/PhotoViewer'
import { SectionLabel } from '../../components/SectionLabel'
import { TextField } from '../../components/TextField'
import { useInspection } from '../../inspection/InspectionContext'
import { MAX_PHOTOS, usePhotoUrls } from '../../inspection/photos'
import { priorAdvice } from '../../inspection/rules'
import type { AdviceTerm, InspectionItem, ItemStatus } from '../../inspection/types'
import { formatDay } from '../../lib/format'

/** Marker for "Anders" in the reason choices; a reason from the part type can never equal it. */
const OTHER = '\u0000other'

type Outcome = {
  label: string
  status: ItemStatus
  term: AdviceTerm | null
  /** Colours when chosen. Red is only for a fault; a repair counts as good. */
  chosen: string
}

// "Nu" is a fault: the customer gets a call.
const outcomes: Outcome[] = [
  { label: 'Nu · klant bellen', status: 'fault', term: null, chosen: 'border-fault bg-fault text-white' },
  { label: 'Nu gerepareerd', status: 'repaired', term: null, chosen: 'border-good bg-good text-white' },
  { label: 'Advies · volgende beurt', status: 'advice', term: 'next_service', chosen: 'border-advice bg-advice text-white' },
  { label: 'Advies · paar maanden', status: 'advice', term: 'few_months', chosen: 'border-advice bg-advice text-white' },
]

type FaultPanelProps = {
  item: InspectionItem
  /** Why the panel is open, when the measurements say so: "De meting is voorbij de adviesgrens." */
  note: string | null
  /** The advice terms are marked as the way to go, because the measurements point to an advice. */
  hintAdvice: boolean
  /** The mechanic decided something here, so a suggestion no longer stands. */
  onDecided: () => void
  onClose: () => void
}

/**
 * M4: under a point that is not good: the reason, and what happens with it. A choice is saved
 * at once. Until an outcome is chosen the reason only lives here, because an open point has none.
 */
export function FaultPanel({ item, note, hintAdvice, onDecided, onClose }: FaultPanelProps) {
  const { setResults, previous, previousByPoint } = useInspection()
  const [reasonChoice, setReasonChoice] = useState<string | null>(() => {
    if (!item.reason) return null
    return item.reason_options.includes(item.reason) ? item.reason : OTHER
  })
  const [otherText, setOtherText] = useState(() =>
    item.reason && !item.reason_options.includes(item.reason) ? item.reason : '',
  )

  const decided = item.status === 'fault' || item.status === 'repaired' || item.status === 'advice'
  const earlier = priorAdvice(previousByPoint, item)

  function reasonOf(choice: string | null, text: string): string | null {
    return choice === OTHER ? text.trim() || null : choice
  }

  function saveOutcome(outcome: Outcome, reason: string | null) {
    void setResults([item.id], outcome.status, outcome.term, reason)
  }

  function chooseOutcome(outcome: Outcome) {
    saveOutcome(outcome, reasonOf(reasonChoice, otherText))
    onDecided()
  }

  /** A changed reason is saved with the outcome that is already chosen. */
  function commitReason(choice: string | null, text: string) {
    const current = outcomes.find((outcome) => outcome.status === item.status && outcome.term === item.term)
    const reason = reasonOf(choice, text)
    if (current && reason !== item.reason) saveOutcome(current, reason)
  }

  function chooseReason(reason: string) {
    const next = reasonChoice === reason ? null : reason
    setReasonChoice(next)
    commitReason(next, otherText)
  }

  return (
    <div className="flex flex-col gap-2.5 pt-1 pb-3">
      {note && <p className={`font-semibold ${item.status === 'fault' ? 'text-fault-ink' : 'text-advice-ink'}`}>{note}</p>}
      {earlier && previous && <Notice tone="advice">Herhaling: {formatDay(previous.completed_at)} al advies</Notice>}

      <SectionLabel>Reden</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {item.reason_options.map((reason) => (
          <OptionButton key={reason} selected={reasonChoice === reason} className="px-3" onClick={() => chooseReason(reason)}>
            {reason}
          </OptionButton>
        ))}
        <OptionButton selected={reasonChoice === OTHER} className="px-3" onClick={() => chooseReason(OTHER)}>
          Anders
        </OptionButton>
      </div>
      {reasonChoice === OTHER && (
        <TextField
          id={`other-${item.id}`}
          label="Omschrijving"
          value={otherText}
          maxLength={200}
          onChange={(event) => setOtherText(event.target.value)}
          onBlur={() => commitReason(reasonChoice, otherText)}
        />
      )}

      <PhotoRow item={item} />

      <SectionLabel>Wat doe je ermee?</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {outcomes.map((outcome) => {
          const chosen = decided && outcome.status === item.status && outcome.term === item.term
          // No term chosen yet, but the measurements point to an advice: mark both terms.
          const hinted = !decided && hintAdvice && outcome.status === 'advice'
          return (
            <button
              key={outcome.label}
              type="button"
              aria-pressed={chosen}
              onClick={() => chooseOutcome(outcome)}
              className={`flex min-h-14 cursor-pointer items-center justify-center rounded-sm border-2 px-2 text-center text-base leading-tight ${
                chosen
                  ? `${outcome.chosen} font-bold`
                  : hinted
                    ? 'border-dashed border-advice bg-advice-tint font-bold text-advice-ink'
                    : 'border-edge bg-surface font-semibold text-ink'
              }`}
            >
              {outcome.label}
            </button>
          )
        })}
      </div>

      <Button
        variant="secondary"
        onClick={() => {
          commitReason(reasonChoice, otherText)
          onClose()
        }}
      >
        Klaar met dit punt
      </Button>
    </div>
  )
}

/**
 * The photos of a point: thumbnails, then the camera button, always in the fourth place. A photo is
 * saved straight after taking it, like every other choice in the panel. At most 3.
 */
function PhotoRow({ item }: { item: InspectionItem }) {
  const { pendingPhotos, addPhoto, retryPhoto, removePhoto } = useInspection()
  const input = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const urlOf = usePhotoUrls(item.photos.map((photo) => photo.path))

  const pending = pendingPhotos.filter((photo) => photo.itemId === item.id)
  const saving = pending.filter((photo) => !photo.failed).length
  const canAdd = item.photos.length + saving < MAX_PHOTOS

  async function take(file: File) {
    setUnreadable(!(await addPhoto(item.id, file)))
  }

  return (
    <>
      <SectionLabel>Foto's</SectionLabel>
      <div className="grid grid-cols-4 gap-2">
        {item.photos.map((photo, index) => (
          <PhotoThumb
            key={photo.id}
            url={urlOf(photo.path)}
            label={`Foto ${index + 1} bekijken`}
            onClick={() => setViewing(index)}
          />
        ))}
        {pending.map((photo) =>
          photo.failed ? (
            <PhotoFailed key={photo.id} onRetry={() => retryPhoto(photo)} />
          ) : (
            <PhotoSaving key={photo.id} url={photo.previewUrl} />
          ),
        )}
        {item.photos.length === 0 && pending.length === 0 && (
          <span className="col-span-3 self-center text-muted">Foto is optioneel</span>
        )}
        {canAdd && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="col-start-4 flex h-[60px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-sm border-2 border-charcoal bg-surface text-base font-bold text-charcoal"
          >
            <Icon name="camera" strokeWidth={2.2} />
            Foto
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared, so the same photo can be chosen again after a failure.
          event.target.value = ''
          if (file) void take(file)
        }}
      />
      {pending.some((photo) => photo.failed) && (
        <Notice tone="fault">Foto niet opgeslagen. Controleer je verbinding en tik op Opnieuw.</Notice>
      )}
      {unreadable && <Notice tone="fault">Deze foto kan niet gelezen worden. Maak hem opnieuw.</Notice>}

      {viewing !== null && (
        <PhotoViewer
          title={item.label}
          eyebrow={item.block_name}
          photos={item.photos}
          start={viewing}
          onClose={() => setViewing(null)}
          onDelete={(photo) => void removePhoto(photo)}
        />
      )}
    </>
  )
}
