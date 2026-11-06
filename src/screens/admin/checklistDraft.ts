import type { ChecklistContent, ChecklistPayload } from '../../inspection/api'
import type { Direction, PartType } from '../../inspection/types'
import { formatNumber } from '../../lib/format'

// The checklist as it is edited on screen. Limits stay text while typing; "3,5" is valid.

export type DraftMeasurement = {
  key: string
  label: string
  unit: string
  direction: Direction
  advice: string
  fault: string
}

export type DraftPoint = {
  key: string
  label: string
  /** Id of the part type, "" for none. */
  partTypeId: string
  measurements: DraftMeasurement[]
}

export type DraftBlock = { key: string; name: string; points: DraftPoint[] }

export type Draft = { name: string; blocks: DraftBlock[] }

export const newMeasurement = (): DraftMeasurement => ({
  key: crypto.randomUUID(),
  label: '',
  unit: 'mm',
  direction: 'lower_is_worse',
  advice: '',
  fault: '',
})

export const newPoint = (): DraftPoint => ({ key: crypto.randomUUID(), label: '', partTypeId: '', measurements: [] })

export const newBlock = (): DraftBlock => ({ key: crypto.randomUUID(), name: '', points: [newPoint()] })

export const emptyDraft = (): Draft => ({ name: '', blocks: [newBlock()] })

export function draftFromContent(content: ChecklistContent): Draft {
  return {
    name: content.name,
    blocks: content.blocks.map((block) => ({
      key: crypto.randomUUID(),
      name: block.name,
      points: block.points.map((point) => ({
        key: crypto.randomUUID(),
        label: point.label,
        partTypeId: point.part_type_id ?? '',
        measurements: point.measurements.map((measurement) => ({
          key: crypto.randomUUID(),
          label: measurement.label,
          unit: measurement.unit,
          direction: measurement.direction,
          advice: measurement.advice_limit === null ? '' : formatNumber(measurement.advice_limit),
          fault: measurement.fault_limit === null ? '' : formatNumber(measurement.fault_limit),
        })),
      })),
    })),
  }
}

/** Blank is no limit. Anything else must be a number from 0 to 9999, otherwise NaN. */
function parseLimit(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text.trim().replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value <= 9999 ? value : Number.NaN
}

const between = (text: string, max: number) => text.trim().length >= 1 && text.trim().length <= max

/** The first problem in Dutch, or null. The database checks the same again. */
export function validate(draft: Draft): string | null {
  if (!between(draft.name, 60)) return 'Geef de checklist een naam van maximaal 60 tekens.'
  if (draft.blocks.length < 1 || draft.blocks.length > 20) return 'Een checklist heeft 1 tot 20 blokken.'
  for (const block of draft.blocks) {
    if (!between(block.name, 60)) return 'Geef elk blok een naam van maximaal 60 tekens.'
    const where = `Blok "${block.name.trim()}"`
    if (block.points.length < 1 || block.points.length > 60) return `${where} heeft 1 tot 60 punten.`
    for (const point of block.points) {
      if (!between(point.label, 80)) return `${where}: geef elk punt een naam van maximaal 80 tekens.`
      const pointWhere = `Punt "${point.label.trim()}"`
      if (point.measurements.length > 10) return `${pointWhere} heeft maximaal 10 metingen.`
      for (const m of point.measurements) {
        if (!between(m.label, 20)) return `${pointWhere}: geef elke meting een naam van maximaal 20 tekens.`
        if (!between(m.unit, 10)) return `${pointWhere}: geef elke meting een eenheid van maximaal 10 tekens.`
        const advice = parseLimit(m.advice)
        const fault = parseLimit(m.fault)
        if (Number.isNaN(advice) || Number.isNaN(fault)) {
          return `${pointWhere}, meting ${m.label.trim()}: een grens is een getal van 0 tot 9999.`
        }
        if (advice !== null && fault !== null) {
          const wrongWay = m.direction === 'lower_is_worse' ? fault > advice : fault < advice
          if (wrongWay) return `${pointWhere}, meting ${m.label.trim()}: de foutgrens ligt voorbij de adviesgrens.`
        }
      }
    }
  }
  return null
}

/** What the RPC wants: part types by name, order by position. Call after validate. */
export function toPayload(draft: Draft, partTypes: PartType[]): ChecklistPayload {
  const names = new Map(partTypes.map((type) => [type.id, type.name]))
  return draft.blocks.map((block) => ({
    name: block.name.trim(),
    points: block.points.map((point) => ({
      label: point.label.trim(),
      part_type: names.get(point.partTypeId) ?? null,
      measurements: point.measurements.map((m) => ({
        label: m.label.trim(),
        unit: m.unit.trim(),
        direction: m.direction,
        advice_limit: parseLimit(m.advice),
        fault_limit: parseLimit(m.fault),
      })),
    })),
  }))
}

/** Moves one entry by `delta` places; stays put at the ends. */
export function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}
