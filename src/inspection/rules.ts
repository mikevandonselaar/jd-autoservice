import { formatNumber } from '../lib/format'
import type { AdviceTerm, InspectionItem, ItemStatus, PreviousVisit, Reading } from './types'

const NBSP = ' '

export const termLabel: Record<AdviceTerm, string> = {
  next_service: 'Volgende beurt',
  few_months: 'Paar maanden',
}

/** What was decided about a point, in a few words, for the line under its name. */
export function decisionText(item: Pick<InspectionItem, 'status' | 'term'>): string {
  switch (item.status) {
    case 'open':
      return 'Open'
    case 'ok':
      return 'Goed'
    case 'repaired':
      return 'Nu gerepareerd'
    case 'fault':
      return 'Nu · klant bellen'
    case 'advice':
      return item.term === 'few_months' ? 'Advies · paar maanden' : 'Advies · volgende beurt'
  }
}

// Measurements ---------------------------------------------------------------

export type ReadingState = 'empty' | 'ok' | 'advice' | 'fault'

function beyond(reading: Reading, value: number, limit: number | null): boolean {
  if (limit === null) return false
  return reading.direction === 'lower_is_worse' ? value < limit : value > limit
}

/** The limit itself is still fine; only a value beyond it counts. */
export function readingState(reading: Reading, value: number | null = reading.value): ReadingState {
  if (value === null) return 'empty'
  if (beyond(reading, value, reading.fault_limit)) return 'fault'
  if (beyond(reading, value, reading.advice_limit)) return 'advice'
  return 'ok'
}

/** What the readings of a point point to: the worst position counts. Null while a position is empty. */
export type Suggestion = 'ok' | 'advice' | 'fault'

export function suggestedStatus(states: ReadingState[]): Suggestion | null {
  if (states.length === 0 || states.includes('empty')) return null
  if (states.includes('fault')) return 'fault'
  if (states.includes('advice')) return 'advice'
  return 'ok'
}

/** Every position of the point has a value, and there is at least one. */
export function isMeasured(item: Pick<InspectionItem, 'readings'>): boolean {
  return item.readings.length > 0 && item.readings.every((reading) => reading.value !== null)
}

/** "6,2", or "≥ 5" when the value is "5 or more". */
export function formatReading(reading: Pick<Reading, 'value' | 'or_more'>): string {
  if (reading.value === null) return '–'
  return `${reading.or_more ? '≥ ' : ''}${formatNumber(reading.value)}`
}

/** "onder 4" or "boven 1" */
export function limitText(reading: Reading, limit: number): string {
  return `${reading.direction === 'lower_is_worse' ? 'onder' : 'boven'} ${formatNumber(limit)}`
}

const STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10]

/** The largest round step that is not more than `target`. */
function niceStep(target: number): number {
  return [...STEPS].reverse().find((step) => step <= target) ?? STEPS[0]
}

const round = (value: number) => Math.round(value * 100) / 100

export type QuickValue = { value: number; orMore: boolean }

/**
 * Ready-made values to tap instead of typing, best first: the good side, then fine steps from
 * the advice limit to just past the fault limit. Made from the limits, so brake lining gives
 * 7 6 5 4 3 2,5 … 0,5. With an "or more" value the good side is that one key and the fine steps
 * below it: tyres give "5 of meer" 4,5 4 3,5 … 1. Empty without limits.
 */
export function quickValues(reading: Reading): QuickValue[] {
  const advice = reading.advice_limit ?? reading.fault_limit
  const fault = reading.fault_limit ?? reading.advice_limit
  if (advice === null || fault === null) return []

  // +1 when a higher value is worse.
  const worse = reading.direction === 'lower_is_worse' ? -1 : 1
  const fine = niceStep((Math.abs(advice - fault) || advice * 0.25 || 1) / 3)

  const bad: QuickValue[] = []
  let pastFault = 0
  for (let step = 0; step < 8; step += 1) {
    const value = round(advice + worse * step * fine)
    if (value < 0) break
    bad.push({ value, orMore: false })
    if (beyond(reading, value, fault)) pastFault += 1
    if (pastFault === 2) break
  }

  const good: QuickValue[] = []
  if (reading.or_more_value !== null) {
    for (let step = 1; step <= 12; step += 1) {
      const value = round(advice + step * fine)
      if (value >= reading.or_more_value) break
      good.unshift({ value, orMore: false })
    }
    good.unshift({ value: reading.or_more_value, orMore: true })
  } else {
    for (let step = 1; step <= 4; step += 1) {
      const value = round(advice - worse * step * fine * 2)
      if (value < 0) break
      good.unshift({ value, orMore: false })
    }
  }
  return [...good, ...bad]
}

/** Text for a value that was typed but not saved yet: "" is empty, "3," is 3. */
export function parseValue(text: string): number | null {
  if (text === '') return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

// Counting -------------------------------------------------------------------

export function countByStatus(items: InspectionItem[]): Record<ItemStatus, number> {
  const counts: Record<ItemStatus, number> = { open: 0, ok: 0, repaired: 0, advice: 0, fault: 0 }
  for (const item of items) counts[item.status] += 1
  return counts
}

export function countReadings(items: InspectionItem[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const item of items) {
    for (const reading of item.readings) {
      total += 1
      if (reading.value !== null) done += 1
    }
  }
  return { done, total }
}

// Findings -------------------------------------------------------------------

type Rankable = Pick<InspectionItem, 'status' | 'term' | 'block_sort' | 'sort'>

/** Faults first, then advice by term, then repairs. */
function findingRank(item: Rankable): number {
  if (item.status === 'fault') return 0
  if (item.status === 'advice') return item.term === 'next_service' ? 1 : 2
  return 3
}

/** The points with a fault, an advice or a repair, most urgent first. */
export function findings<T extends Rankable>(items: T[]): T[] {
  return items
    .filter((item) => item.status === 'fault' || item.status === 'advice' || item.status === 'repaired')
    .sort((a, b) => findingRank(a) - findingRank(b) || a.block_sort - b.block_sort || a.sort - b.sort)
}

/** "LA 3,4 · RA ≥ 5 mm" or "1,4 mm", for the readings that have a value. */
export function readingsSummary(item: Pick<InspectionItem, 'readings'>): string {
  const filled = item.readings.filter((reading) => reading.value !== null)
  if (filled.length === 0) return ''
  const unit = filled[0].unit
  if (item.readings.length === 1) return `${formatReading(filled[0])}${NBSP}${unit}`
  // Non-breaking spaces keep "LV ≥ 5" and the dot after it together when the line wraps.
  return `${filled.map((r) => `${r.label}${NBSP}${formatReading(r).replace(' ', NBSP)}`).join(`${NBSP}· `)}${NBSP}${unit}`
}

// Previous visit -------------------------------------------------------------

function itemKey(item: Pick<InspectionItem, 'block_name' | 'label'>): string {
  return `${item.block_name}\u0000${item.label}`
}

/** Points of the previous visit by block and name, to compare with this visit. */
export function previousItems(previous: PreviousVisit | null): Map<string, InspectionItem> {
  return new Map((previous?.items ?? []).map((item) => [itemKey(item), item]))
}

export function previousItem(map: Map<string, InspectionItem>, item: InspectionItem): InspectionItem | undefined {
  return map.get(itemKey(item))
}

/** The advice given for this point at the previous visit, if any. */
export function priorAdvice(map: Map<string, InspectionItem>, item: InspectionItem): InspectionItem | undefined {
  const found = previousItem(map, item)
  return found?.status === 'advice' ? found : undefined
}

/** The same measurement at the previous visit, when it had a value. */
export function previousReading(
  map: Map<string, InspectionItem>,
  item: InspectionItem,
  reading: Reading,
): Reading | undefined {
  const found = previousItem(map, item)?.readings.find((r) => r.label === reading.label)
  return found?.value === null ? undefined : found
}
