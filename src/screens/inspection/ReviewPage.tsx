import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { PlateBadge } from '../../components/PlateBadge'
import { SectionLabel } from '../../components/SectionLabel'
import { TextArea } from '../../components/TextArea'
import { useInspection } from '../../inspection/InspectionContext'
import { countByStatus, findings, priorAdvice, readingState, readingsSummary, termLabel } from '../../inspection/rules'
import type { InspectionItem, ItemStatus } from '../../inspection/types'
import { formatNumber } from '../../lib/format'
import { FaultSheet } from './FaultSheet'

const counters: { status: ItemStatus; label: string; icon: IconName; tone: string }[] = [
  { status: 'ok', label: 'Goed', icon: 'check', tone: 'text-good-ink' },
  { status: 'repaired', label: 'Gerepareerd', icon: 'wrench', tone: 'text-good-ink' },
  { status: 'advice', label: 'Advies', icon: 'clock', tone: 'text-advice-ink' },
  { status: 'fault', label: 'Fout', icon: 'warning', tone: 'text-fault-ink' },
]

function badgeFor(item: InspectionItem): { text: string; classes: string } {
  if (item.status === 'fault') return { text: 'Nu', classes: 'border-fault bg-fault text-white' }
  if (item.status === 'advice') {
    return { text: item.term ? termLabel[item.term] : 'Advies', classes: 'border-advice bg-advice-tint text-advice-ink' }
  }
  return { text: 'Gerepareerd', classes: 'border-good bg-good-tint text-good-ink' }
}

/** M5: everything that was found, before the inspection is completed. */
export function ReviewPage() {
  const navigate = useNavigate()
  const { inspection, items, previousByPoint, saveFailed, complete } = useInspection()
  const [note, setNote] = useState(inspection.note ?? '')
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (inspection.status === 'completed') return <Navigate to={`/inspectie/${inspection.id}/klaar`} replace />

  const counts = countByStatus(items)
  const found = findings(items)
  const measured = items.filter((item) => item.readings.some((reading) => reading.value !== null))
  const editing = items.find((item) => item.id === editId)

  async function finish() {
    setSaving(true)
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
      {saveFailed && <Notice tone="fault">Afronden lukt nu niet. Controleer je verbinding en probeer het opnieuw.</Notice>}

      <div className="grid grid-cols-2 gap-2">
        {counters.map(({ status, label, icon, tone }) => (
          <div
            key={status}
            className={`flex min-h-[52px] items-center gap-2.5 rounded-sm border border-divider bg-surface px-3 font-semibold ${tone}`}
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
            const badge = badgeFor(item)
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
                onClick={() => setEditId(item.id)}
                className="flex min-h-[60px] w-full cursor-pointer items-center gap-2.5 border-b border-divider px-3 py-1.5 text-left last:border-b-0"
              >
                <span
                  className={`flex min-h-[30px] w-[104px] flex-none items-center justify-center rounded-sm border-2 p-0.5 text-center text-base leading-tight font-bold ${badge.classes}`}
                >
                  {badge.text}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{item.label}</span>
                  {detail && <span className="block text-muted">{detail}</span>}
                </span>
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
                    return (
                      <span key={reading.id}>
                        {index > 0 && ' · '}
                        {item.readings.length > 1 && `${reading.label} `}
                        <b className={state === 'fault' ? 'text-fault-ink' : state === 'advice' ? 'text-advice-ink' : ''}>
                          {reading.value === null ? '–' : formatNumber(reading.value)}
                        </b>
                      </span>
                    )
                  })}{' '}
                  {item.readings[0].unit}
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
        onChange={(event) => setNote(event.target.value)}
      />

      {editing && <FaultSheet item={editing} suggest={null} onClose={() => setEditId(null)} />}
    </AppShell>
  )
}
