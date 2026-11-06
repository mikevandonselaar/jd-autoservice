import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { Icon } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { OptionButton } from '../../components/OptionButton'
import { SectionLabel } from '../../components/SectionLabel'
import { TextField } from '../../components/TextField'
import { useInspection } from '../../inspection/InspectionContext'
import { limitText, priorAdvice, readingState, termLabel } from '../../inspection/rules'
import type { AdviceTerm, InspectionItem, Reading } from '../../inspection/types'
import { formatDay, formatNumber } from '../../lib/format'

// The sheet offers "Nu" next to the two terms. "Nu" is a fault: the customer gets a call.
type Term = 'now' | AdviceTerm
type Action = 'repaired' | 'advice'

/** Marker for "Anders" in the reason choices; a reason from the part type can never equal it. */
const OTHER = '\u0000other'

type FaultSheetProps = {
  item: InspectionItem
  /** What the measurements point to, to start with. */
  suggest: 'fault' | 'advice' | null
  onClose: () => void
}

function initialAction(item: InspectionItem, suggest: FaultSheetProps['suggest']): Action | null {
  if (item.status === 'repaired') return 'repaired'
  if (item.status === 'advice' || item.status === 'fault' || suggest) return 'advice'
  return null
}

function initialTerm(item: InspectionItem, suggest: FaultSheetProps['suggest']): Term | null {
  if (item.status === 'fault') return 'now'
  if (item.status === 'advice') return item.term
  return suggest === 'fault' ? 'now' : null
}

/** The reading that is furthest beyond a limit, with the text about that limit. */
function worstReading(item: InspectionItem): { reading: Reading; fault: boolean; text: string } | null {
  let found: { reading: Reading; fault: boolean; text: string } | null = null
  for (const reading of item.readings) {
    const state = readingState(reading)
    if (state !== 'fault' && state !== 'advice') continue
    const fault = state === 'fault'
    const limit = fault ? reading.fault_limit : reading.advice_limit
    if (limit === null || (found && found.fault && !fault)) continue
    found = {
      reading,
      fault,
      text: `${fault ? 'Fout' : 'Advies'} · ${limitText(reading, limit)} ${reading.unit}`,
    }
  }
  return found
}

/** M4: why a point is not good, and what happens with it. */
export function FaultSheet({ item, suggest, onClose }: FaultSheetProps) {
  const { setResults, previous, previousByPoint } = useInspection()
  const [action, setAction] = useState<Action | null>(() => initialAction(item, suggest))
  const [term, setTerm] = useState<Term | null>(() => initialTerm(item, suggest))
  const [reasonChoice, setReasonChoice] = useState<string | null>(() => {
    if (!item.reason) return null
    return item.reason_options.includes(item.reason) ? item.reason : OTHER
  })
  const [otherText, setOtherText] = useState(() =>
    item.reason && !item.reason_options.includes(item.reason) ? item.reason : '',
  )

  const measured = worstReading(item)
  const earlier = priorAdvice(previousByPoint, item)
  const canSave = action === 'repaired' || (action === 'advice' && term !== null)

  function save() {
    if (!canSave) return
    const reason = reasonChoice === OTHER ? otherText : reasonChoice
    if (action === 'repaired') {
      void setResults([item.id], 'repaired', null, reason)
    } else if (term === 'now') {
      void setResults([item.id], 'fault', null, reason)
    } else {
      void setResults([item.id], 'advice', term, reason)
    }
    onClose()
  }

  return (
    <BottomSheet
      eyebrow={item.block_name}
      title={item.label}
      onClose={onClose}
      footer={
        <Button disabled={!canSave} onClick={save}>
          Opslaan
        </Button>
      }
    >
      {measured && (
        <div
          className={`flex items-center gap-3 rounded-sm border-2 px-3 py-2 ${
            measured.fault ? 'border-fault bg-fault-tint text-fault-ink' : 'border-advice bg-advice-tint text-advice-ink'
          }`}
        >
          <Icon name={measured.fault ? 'warning' : 'clock'} className="size-[22px]" strokeWidth={2.6} />
          <span className="flex-1 font-bold">
            {item.readings.length > 1 && `${measured.reading.label}: `}
            {measured.text}
          </span>
          <span className="text-[30px] font-bold text-ink">
            {formatNumber(measured.reading.value!)} <span className="text-base text-muted">{measured.reading.unit}</span>
          </span>
        </div>
      )}
      {earlier && previous && <Notice tone="advice">Herhaling: {formatDay(previous.completed_at)} al advies</Notice>}

      <SectionLabel>Reden</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {item.reason_options.map((reason) => (
          <OptionButton
            key={reason}
            selected={reasonChoice === reason}
            className="px-3.5"
            onClick={() => setReasonChoice(reasonChoice === reason ? null : reason)}
          >
            {reason}
          </OptionButton>
        ))}
        <OptionButton
          selected={reasonChoice === OTHER}
          className="px-3.5"
          onClick={() => setReasonChoice(reasonChoice === OTHER ? null : OTHER)}
        >
          Anders
        </OptionButton>
      </div>
      {reasonChoice === OTHER && (
        <TextField
          id="fault-other"
          label="Omschrijving"
          value={otherText}
          maxLength={200}
          onChange={(event) => setOtherText(event.target.value)}
        />
      )}

      <SectionLabel>Wat doe je ermee?</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <OptionButton selected={action === 'repaired'} onClick={() => setAction('repaired')}>
          Nu gerepareerd
        </OptionButton>
        <OptionButton selected={action === 'advice'} onClick={() => setAction('advice')}>
          Advies
        </OptionButton>
      </div>

      {action === 'advice' && (
        <>
          <SectionLabel>Termijn</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <OptionButton selected={term === 'now'} onClick={() => setTerm('now')}>
              Nu
            </OptionButton>
            <OptionButton selected={term === 'next_service'} onClick={() => setTerm('next_service')}>
              {termLabel.next_service}
            </OptionButton>
            <OptionButton selected={term === 'few_months'} onClick={() => setTerm('few_months')}>
              {termLabel.few_months}
            </OptionButton>
          </div>
          {term === 'now' && <p className="text-muted">Nu nodig: bel de klant.</p>}
        </>
      )}
    </BottomSheet>
  )
}
