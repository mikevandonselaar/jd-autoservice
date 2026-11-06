import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { Icon } from '../../components/icons'
import { NumericKeypad, type KeypadKey } from '../../components/NumericKeypad'
import { Notice } from '../../components/Notice'
import { useInspection } from '../../inspection/InspectionContext'
import { limitText, parseValue, previousValue, readingState, suggestedStatus } from '../../inspection/rules'
import type { InspectionItem } from '../../inspection/types'
import { formatNumber } from '../../lib/format'

type MeasureSheetProps = {
  item: InspectionItem
  /** The measurement to start with. */
  readingId: string
  onClose: () => void
  /** Called after the last position is saved. `suggest` is the result the values point to. */
  onFinish: (suggest: 'fault' | 'advice' | null) => void
}

/** Adds one key to the typed text: at most one comma, two decimals and a value below 10 000. */
function applyKey(text: string, key: KeypadKey): string {
  if (key === 'back') return text.slice(0, -1)
  if (key === ',') {
    if (text.includes(',')) return text
    return text === '' ? '0,' : `${text},`
  }
  const [whole, decimals] = text.split(',')
  if (decimals !== undefined) return decimals.length >= 2 ? text : text + key
  if (whole === '0') return key
  return whole.length >= 4 ? text : text + key
}

/** M3: type a measured value with our own keypad, one position at a time. */
export function MeasureSheet({ item, readingId, onClose, onFinish }: MeasureSheetProps) {
  const { setReadingValue, previousByPoint } = useInspection()
  const readings = item.readings
  const [index, setIndex] = useState(Math.max(0, readings.findIndex((reading) => reading.id === readingId)))
  // What is typed, per measurement. Saved when you move on or close the sheet.
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(readings.map((reading) => [reading.id, reading.value === null ? '' : formatNumber(reading.value)])),
  )

  const current = readings[index]
  const multiple = readings.length > 1
  const last = index === readings.length - 1
  const typed = texts[current.id]
  const value = parseValue(typed)
  const state = readingState(current, value)
  const previous = previousValue(previousByPoint, item, current)

  function commit(readingIndex: number) {
    const reading = readings[readingIndex]
    const next = parseValue(texts[reading.id])
    if (next !== reading.value) void setReadingValue(reading.id, next)
  }

  function close() {
    commit(index)
    onClose()
  }

  function goTo(readingIndex: number) {
    commit(index)
    setIndex(readingIndex)
  }

  function saveAndContinue() {
    commit(index)
    if (!last) {
      setIndex(index + 1)
      return
    }
    const states = readings.map((reading) => readingState(reading, parseValue(texts[reading.id])))
    onFinish(suggestedStatus(states))
  }

  const side = current.direction === 'lower_is_worse' ? 'Onder' : 'Boven'
  const stateNotice =
    state === 'fault'
      ? `${side} de foutgrens: je legt zo de fout vast`
      : state === 'advice'
        ? `${side} de adviesgrens: je kiest zo een termijn`
        : null

  return (
    <BottomSheet
      eyebrow={item.block_name}
      title={item.label}
      onClose={close}
      footer={
        <Button onClick={saveAndContinue}>
          {last ? 'Opslaan' : `Opslaan, volgende: ${readings[index + 1].label}`}
          {!last && <Icon name="next" />}
        </Button>
      }
    >
      {multiple && (
        <div className="flex gap-1.5">
          {readings.map((reading, i) => {
            const text = texts[reading.id]
            const selected = i === index
            const readingValue = parseValue(text)
            const looks = selected
              ? 'border-charcoal bg-charcoal text-white'
              : readingValue === null
                ? 'border-dashed border-edge-open bg-surface'
                : 'border-edge bg-surface'
            return (
              <button
                key={reading.id}
                type="button"
                aria-pressed={selected}
                onClick={() => goTo(i)}
                className={`flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-sm border-2 px-0.5 ${looks}`}
              >
                <span className={`text-base font-bold ${selected ? 'text-white' : 'text-muted'}`}>{reading.label}</span>
                <span className="text-lg font-bold">{readingValue === null ? '–' : text}</span>
              </button>
            )
          })}
        </div>
      )}

      <label htmlFor="reading" className="text-base font-semibold">
        {item.label} · {current.label}
      </label>
      <div className="-mt-1 flex h-[76px] items-baseline gap-2 rounded-sm border-[3px] border-charcoal px-4">
        <input
          id="reading"
          readOnly
          inputMode="none"
          value={typed}
          placeholder="–"
          className="h-[70px] min-w-0 flex-1 bg-transparent text-5xl font-bold text-ink placeholder:text-muted focus:outline-none"
        />
        <span className="text-xl font-semibold text-muted">{current.unit}</span>
      </div>

      <div className="flex flex-wrap justify-between gap-x-3">
        <span className="text-muted">
          {previous === null ? '' : `Vorige keer ${formatNumber(previous)} ${current.unit}`}
        </span>
        <span className="font-semibold">
          {current.advice_limit !== null && `Advies ${limitText(current, current.advice_limit)}`}
          {current.advice_limit !== null && current.fault_limit !== null && ' · '}
          {current.fault_limit !== null && `Fout ${limitText(current, current.fault_limit)}`}
        </span>
      </div>

      {stateNotice && <Notice tone={state === 'fault' ? 'fault' : 'advice'}>{stateNotice}</Notice>}

      <NumericKeypad onKey={(key) => setTexts((all) => ({ ...all, [current.id]: applyKey(all[current.id], key) }))} />
    </BottomSheet>
  )
}
