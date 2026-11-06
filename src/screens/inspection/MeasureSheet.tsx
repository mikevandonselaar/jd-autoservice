import { useRef, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { Icon } from '../../components/icons'
import { NumericKeypad, type KeypadKey } from '../../components/NumericKeypad'
import { useInspection } from '../../inspection/InspectionContext'
import {
  belowZero,
  formatReading,
  limitText,
  parseValue,
  previousReading,
  quickValues,
  readingState,
  type QuickValue,
  type ReadingState,
} from '../../inspection/rules'
import type { InspectionItem, Reading } from '../../inspection/types'
import { formatNumber } from '../../lib/format'

type MeasureSheetProps = {
  item: InspectionItem
  /** The measurement to start with. */
  readingId: string
  /** Closed without a complete set of values, or without a change. */
  onClose: () => void
  /** Every position has a value and something was changed here. Gets the readings as saved. */
  onFinish: (readings: Reading[]) => void
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

/** The first empty position after `from`, wrapping round, not `from` itself. -1 when there is none. */
function nextEmpty(readings: Reading[], from: number): number {
  for (let step = 1; step < readings.length; step += 1) {
    const at = (from + step) % readings.length
    if (readings[at].value === null) return at
  }
  return -1
}

// Static class names, so Tailwind sees them.
const spans = ['', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4']

/** How many of the four columns "Typen" takes, to fill the last row of the quick values. */
function typeSpan(quick: QuickValue[]): number {
  const used = quick.reduce((sum, choice) => sum + (choice.orMore ? 2 : 1), 0)
  return used % 4 === 0 ? 4 : 4 - (used % 4)
}

const chipLooks: Record<ReadingState, string> = {
  empty: 'border-2 border-edge bg-surface',
  ok: 'border-2 border-good bg-good-tint',
  advice: 'border-2 border-advice bg-advice-tint',
  fault: 'border-[3px] border-fault bg-fault-tint',
}

const positionLooks: Record<ReadingState, string> = {
  empty: 'border-dashed border-edge-open bg-surface',
  ok: 'border-good bg-good-tint',
  advice: 'border-advice bg-advice-tint',
  fault: 'border-fault bg-fault-tint',
}

/**
 * M3: measure a point from a sheet. One tap on a ready-made value saves it and moves on to the
 * next position; "Typen" gives the keypad for an exact value.
 */
export function MeasureSheet({ item, readingId, onClose, onFinish }: MeasureSheetProps) {
  const { setReadingValue, previousByPoint } = useInspection()
  const readings = item.readings
  const [index, setIndex] = useState(Math.max(0, readings.findIndex((reading) => reading.id === readingId)))
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [touched, setTouched] = useState(false)
  // What was saved in this sheet. The state of the screen only catches up after the next render.
  const saved = useRef(new Map<string, { value: number | null; or_more: boolean }>())

  const current = readings[index]
  const multiple = readings.length > 1
  const previous = previousReading(previousByPoint, item, current)
  const quick = quickValues(current)
  // The keypad has no minus key: for coolant the typed digits are below zero.
  const sign = belowZero(current) ? -1 : 1
  const emptyWithOrMore = readings.filter((reading) => reading.value === null && reading.or_more_value !== null)

  function snapshot(): Reading[] {
    return readings.map((reading) => ({ ...reading, ...saved.current.get(reading.id) }))
  }

  function save(reading: Reading, value: number | null, orMore: boolean) {
    saved.current.set(reading.id, { value, or_more: orMore })
    void setReadingValue(reading.id, value, orMore)
  }

  function goTo(position: number) {
    commitTyped()
    setIndex(position)
    setTyping(false)
  }

  /** Moves on to the next empty position, or reports that the point is complete. */
  function moveOn(from: number) {
    const now = snapshot()
    const next = nextEmpty(now, from)
    if (next === -1) onFinish(now)
    else {
      setIndex(next)
      setTyping(false)
    }
  }

  function pick(choice: QuickValue) {
    save(current, choice.value, choice.orMore)
    moveOn(index)
  }

  function pickRest() {
    for (const reading of emptyWithOrMore) save(reading, reading.or_more_value, true)
    moveOn(index)
  }

  function startTyping() {
    setTyped(current.value !== null && !current.or_more ? formatNumber(Math.abs(current.value)) : '')
    setTouched(false)
    setTyping(true)
  }

  /** Saves what was typed, when it was touched. */
  function commitTyped() {
    if (!typing || !touched) return
    const typedValue = parseValue(typed)
    const value = typedValue === null ? null : sign * typedValue
    if (value !== current.value || current.or_more) save(current, value, false)
  }

  function typedNext() {
    if (parseValue(typed) === null) return
    commitTyped()
    moveOn(index)
  }

  function close() {
    commitTyped()
    const now = snapshot()
    if (saved.current.size > 0 && now.every((reading) => reading.value !== null)) onFinish(now)
    else onClose()
  }

  // The state of the screen is up to date at render time, so no need for what was saved here.
  const last = nextEmpty(readings, index) === -1

  return (
    <BottomSheet
      eyebrow={item.block_name}
      title={item.label}
      onClose={close}
      footer={
        typing && (
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <Button variant="secondary" onClick={() => setTyping(false)}>
              Snelkeuze
            </Button>
            <Button disabled={parseValue(typed) === null} onClick={typedNext}>
              {last ? 'Klaar' : 'Volgende'}
              {!last && <Icon name="next" />}
            </Button>
          </div>
        )
      }
    >
      {multiple && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${readings.length}, minmax(0, 1fr))` }}>
          {readings.map((reading, position) => {
            const selected = position === index
            return (
              <button
                key={reading.id}
                type="button"
                aria-pressed={selected}
                onClick={() => goTo(position)}
                className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center rounded-sm border-2 px-0.5 ${
                  selected ? 'border-charcoal bg-charcoal text-white' : positionLooks[readingState(reading)]
                }`}
              >
                <span className={`text-base font-bold ${selected ? 'text-white' : 'text-muted'}`}>{reading.label}</span>
                <span className="text-lg font-bold">{formatReading(reading)}</span>
              </button>
            )
          })}
        </div>
      )}

      {!typing && emptyWithOrMore.length >= 2 && (
        <button
          type="button"
          onClick={pickRest}
          className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-good bg-good-tint px-3 text-center text-lg leading-tight font-bold text-good-ink"
        >
          <Icon name="check" strokeWidth={3} />
          {emptyWithOrMore.length === readings.length ? 'Alle' : 'Overige'} {item.label.toLowerCase()}{' '}
          {formatNumber(emptyWithOrMore[0].or_more_value!)} {emptyWithOrMore[0].unit} of meer
        </button>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-bold">{multiple ? `${item.label} · ${current.label}` : current.label}</span>
          {previous && (
            <span className="text-muted">
              Vorige keer {formatReading(previous)} {previous.unit}
            </span>
          )}
        </div>
        <p className="text-muted">
          {current.advice_limit !== null && `Advies ${limitText(current, current.advice_limit)}`}
          {current.advice_limit !== null && current.fault_limit !== null && ' · '}
          {current.fault_limit !== null && `Fout ${limitText(current, current.fault_limit)}`}
        </p>
      </div>

      {typing ? (
        <>
          <div
            aria-live="polite"
            className="flex h-14 flex-none items-baseline justify-end gap-2 rounded-sm border-[3px] border-charcoal px-4 text-2xl font-bold"
          >
            <span className="flex h-full items-center">{typed === '' ? <span className="text-muted">–</span> : `${sign < 0 ? '-' : ''}${typed}`}</span>
            <span className="self-center text-lg font-semibold text-muted">{current.unit}</span>
          </div>
          <NumericKeypad
            onKey={(key) => {
              setTyped((text) => applyKey(text, key))
              setTouched(true)
            }}
          />
        </>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {quick.map((choice) => {
            const selected = current.value === choice.value && current.or_more === choice.orMore
            return (
              <button
                key={`${choice.value}-${choice.orMore}`}
                type="button"
                onClick={() => pick(choice)}
                aria-pressed={selected}
                className={`flex min-h-14 cursor-pointer items-center justify-center rounded-sm px-1 text-xl font-bold text-ink ${
                  choice.orMore ? 'col-span-2' : ''
                } ${chipLooks[readingState(current, choice.value)]} ${
                  selected ? 'shadow-[0_0_0_3px_var(--color-charcoal)]' : ''
                }`}
              >
                {formatNumber(choice.value)}
                {choice.orMore && <span className="ml-1.5 text-lg font-semibold">of meer</span>}
              </button>
            )
          })}
          <button
            type="button"
            onClick={startTyping}
            className={`flex min-h-14 cursor-pointer items-center justify-center rounded-sm border-2 border-charcoal bg-surface px-1 text-lg font-bold text-charcoal ${spans[typeSpan(quick)]}`}
          >
            Typen
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
