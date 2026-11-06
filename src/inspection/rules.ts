import { formatNumber } from '../lib/format'
import type { AdviceTerm, InspectionItem, ItemStatus, PreviousVisit, Reading } from './types'

export const termLabel: Record<AdviceTerm, string> = {
  next_service: 'Volgende beurt',
  few_months: 'Paar maanden',
}

/** Status text for the narrow tile of the checklist. */
export function tileLabel(item: InspectionItem): string {
  switch (item.status) {
    case 'open':
      return 'Open'
    case 'ok':
      return 'Goed'
    case 'repaired':
      return 'Gerepareerd'
    case 'fault':
      return 'Niet goed'
    case 'advice':
      return item.term === 'few_months' ? 'Advies · paar mnd' : 'Advies · volg. beurt'
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

/** The result the readings suggest for the point, or null when all values are fine. */
export function suggestedStatus(states: ReadingState[]): 'fault' | 'advice' | null {
  if (states.includes('fault')) return 'fault'
  if (states.includes('advice')) return 'advice'
  return null
}

/** "onder 4" or "boven 1" */
export function limitText(reading: Reading, limit: number): string {
  return `${reading.direction === 'lower_is_worse' ? 'onder' : 'boven'} ${formatNumber(limit)}`
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

/** Faults first, then advice by term, then repairs. */
function findingRank(item: InspectionItem): number {
  if (item.status === 'fault') return 0
  if (item.status === 'advice') return item.term === 'next_service' ? 1 : 2
  return 3
}

export function findings(items: InspectionItem[]): InspectionItem[] {
  return items
    .filter((item) => item.status === 'fault' || item.status === 'advice' || item.status === 'repaired')
    .sort((a, b) => findingRank(a) - findingRank(b) || a.block_sort - b.block_sort || a.sort - b.sort)
}

/** "LA 3,4 · RA 3,6 mm" or "1,4 mm", for the readings that have a value. */
export function readingsSummary(item: InspectionItem): string {
  const filled = item.readings.filter((reading) => reading.value !== null)
  if (filled.length === 0) return ''
  const unit = filled[0].unit
  if (item.readings.length === 1) return `${formatNumber(filled[0].value!)} ${unit}`
  return `${filled.map((r) => `${r.label} ${formatNumber(r.value!)}`).join(' · ')} ${unit}`
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

export function previousValue(map: Map<string, InspectionItem>, item: InspectionItem, reading: Reading): number | null {
  return previousItem(map, item)?.readings.find((r) => r.label === reading.label)?.value ?? null
}
