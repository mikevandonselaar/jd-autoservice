import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { Button } from '../../components/Button'
import { FindingBadge } from '../../components/FindingBadge'
import { Icon, type IconName } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { PlateBadge } from '../../components/PlateBadge'
import { SectionLabel } from '../../components/SectionLabel'
import { TextArea } from '../../components/TextArea'
import { useInspection } from '../../inspection/InspectionContext'
import { usePhotoUrls } from '../../inspection/photos'
import { countByStatus, findings, formatReading, priorAdvice, readingState, readingsSummary } from '../../inspection/rules'
import type { ItemStatus } from '../../inspection/types'

const counters: { status: ItemStatus; label: string; icon: IconName; tone: string }[] = [
  { status: 'ok', label: 'Goed', icon: 'check', tone: 'text-good-ink' },
  { status: 'repaired', label: 'Gerepareerd', icon: 'wrench', tone: 'text-good-ink' },
  { status: 'advice', label: 'Advies', icon: 'clock', tone: 'text-advice-ink' },
  { status: 'fault', label: 'Fout', icon: 'warning', tone: 'text-fault-ink' },
]

/** M5: everything that was found, before the inspection is completed. */
export function ReviewPage() {
  const navigate = useNavigate()
  const { inspection, items, previousByPoint, saveFailed, saveNote, complete } = useInspection()
  const [note, setNote] = useState(inspection.note ?? '')
  const [saving, setSaving] = useState(false)

  // The note is saved shortly after typing stops, like every other tap. Saves run one after
  // the other, so an older text never overwrites a newer one.
  const noteTimer = useRef<number | undefined>(undefined)
  const unsavedNote = useRef<string | null>(null)
  const noteSaves = useRef<Promise<void>>(Promise.resolve())

  const flushNote = useCallback(() => {
    clearTimeout(noteTimer.current)
    const text = unsavedNote.current
    if (text !== null) {
      unsavedNote.current = null
      noteSaves.current = noteSaves.current.then(() => saveNote(text))
    }
    return noteSaves.current
  }, [saveNote])

  // Leaving the page saves what was typed.
  useEffect(
    () => () => {
      void flushNote()
    },
    [flushNote],
  )

  function changeNote(text: string) {
    setNote(text)
    unsavedNote.current = text
    clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => void flushNote(), 800)
  }
  const found = findings(items)
  // The first photo of each finding, as a thumbnail.
  const urlOf = usePhotoUrls(found.flatMap((item) => item.photos.slice(0, 1).map((photo) => photo.path)))

  if (inspection.status === 'completed') return <Navigate to={`/inspectie/${inspection.id}/klaar`} replace />

  const counts = countByStatus(items)
  const measured = items.filter((item) => item.readings.some((reading) => reading.value !== null))

  async function finish() {
    setSaving(true)
    // Completing saves the note itself; a save still under way must land before it.
    clearTimeout(noteTimer.current)
    unsavedNote.current = null
    await noteSaves.current
    if (await complete(note)) navigate(`/inspectie/${inspection.id}/klaar`, { replace: true })
    else setSaving(false)
  }

  return (
    <AppShell
      headerStart={
        <BackHeader
          to={`/inspectie/${inspection.id}`}
          label="Terug naar checklist"
          title="Controle"
          end={<PlateBadge plate={inspection.plate} />}
        />
      }
      footer={
        <Button disabled={saving || counts.open > 0} onClick={() => void finish()}>
          Inspectie afronden
        </Button>
      }
    >
      {counts.open > 0 && (
        <Notice tone="advice">
          Er staan nog {counts.open} {counts.open === 1 ? 'punt' : 'punten'} open. Vul die eerst in.
        </Notice>
      )}
      {saveFailed && <Notice tone="fault">Opslaan lukt nu niet. Controleer je verbinding en probeer het opnieuw.</Notice>}

      <div className="grid grid-cols-2 gap-2">
        {counters.map(({ status, label, icon, tone }) => (
          <div
            key={status}
            className={`flex min-h-12 items-center gap-2.5 rounded-sm border border-divider bg-surface px-3 font-semibold ${tone}`}
          >
            <Icon name={icon} className="size-[18px]" strokeWidth={2.6} />
            {label}
            <b className="ml-auto text-2xl text-ink">{counts[status]}</b>
          </div>
        ))}
      </div>

      <SectionLabel>Gevonden · {found.length}</SectionLabel>
      {found.length === 0 ? (
        <p className="-mt-2 text-muted">Niets bijzonders gevonden.</p>
      ) : (
        <div className="-mt-2 overflow-hidden rounded-sm border border-divider bg-surface">
          {found.map((item) => {
            const detail = [
              readingsSummary(item),
              item.reason,
              item.status !== 'repaired' && priorAdvice(previousByPoint, item) ? 'herhaling' : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/inspectie/${inspection.id}`, { state: { expand: item.id } })}
                className="flex min-h-14 w-full cursor-pointer items-center gap-2.5 border-b border-divider px-3 py-1.5 text-left last:border-b-0"
              >
                <FindingBadge status={item.status} term={item.term} className="w-[104px]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{item.label}</span>
                  {detail && <span className="block text-muted">{detail}</span>}
                </span>
                {item.photos.length > 0 && (
                  <span className="relative flex size-11 flex-none items-center justify-center rounded-sm border border-edge bg-divider text-muted">
                    {urlOf(item.photos[0].path) ? (
                      <img src={urlOf(item.photos[0].path)} alt="" className="size-full rounded-sm object-cover" />
                    ) : (
                      <Icon name="image" className="size-5" strokeWidth={2} />
                    )}
                    <b className="absolute -right-1.5 -bottom-1.5 min-w-[22px] rounded-full bg-charcoal px-1.5 text-center text-base leading-[22px] text-white">
                      {item.photos.length}
                    </b>
                    <span className="sr-only">{item.photos.length === 1 ? '1 foto' : `${item.photos.length} foto's`}</span>
                  </span>
                )}
                <Icon name="next" className="size-4 text-charcoal" />
              </button>
            )
          })}
        </div>
      )}

      {measured.length > 0 && (
        <>
          <SectionLabel>Metingen</SectionLabel>
          <div className="-mt-2 flex flex-col gap-1.5">
            {measured.map((item) => (
              <div key={item.id} className="flex gap-2.5">
                <span className="w-[120px] flex-none font-semibold text-muted">{item.label}</span>
                <span>
                  {item.readings.map((reading, index) => {
                    const state = readingState(reading)
                    const last = index === item.readings.length - 1
                    return (
                      // One entry never wraps in the middle; the unit stays with the last one.
                      <span key={reading.id} className="whitespace-nowrap">
                        {index > 0 && '· '}
                        {item.readings.length > 1 && `${reading.label} `}
                        <b className={state === 'fault' ? 'text-fault-ink' : state === 'advice' ? 'text-advice-ink' : ''}>
                          {formatReading(reading)}
                        </b>
                        {last ? ` ${reading.unit}` : ' '}
                      </span>
                    )
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <TextArea
        id="note"
        label="Notitie voor de balie"
        note="optioneel"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(event) => changeNote(event.target.value)}
        onBlur={() => void flushNote()}
      />
    </AppShell>
  )
}
