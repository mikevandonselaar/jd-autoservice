import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { findings } from './rules'
import type {
  AdviceTerm,
  Checklist,
  Inspection,
  InspectionItem,
  ItemStatus,
  PartType,
  Photo,
  PreviousVisit,
} from './types'

/** Reads go through RLS, writes through RPC functions that check the role and the input. */
function unwrap<T>({ data, error }: { data: unknown; error: PostgrestError | null }): T {
  if (error) throw error
  return data as T
}

const ITEM_COLUMNS =
  'id, inspection_id, block_name, block_sort, label, sort, reason_options, status, term, reason, ' +
  'readings:inspection_readings(id, item_id, label, unit, direction, advice_limit, fault_limit, or_more_value, sort, value, or_more), ' +
  'photos:inspection_photos(id, path, created_at)'

const byCreated = (a: Photo, b: Photo) => a.created_at.localeCompare(b.created_at)

const INSPECTION_COLUMNS =
  'id, plate, plate_key, odometer_km, checklist_name, mechanic_id, status, note, started_at, completed_at'

async function fetchItems(inspectionId: string): Promise<InspectionItem[]> {
  const items = unwrap<InspectionItem[]>(
    await supabase.from('inspection_items').select(ITEM_COLUMNS).eq('inspection_id', inspectionId),
  )
  for (const item of items) {
    item.readings.sort((a, b) => a.sort - b.sort)
    item.photos.sort(byCreated)
  }
  return items.sort((a, b) => a.block_sort - b.block_sort || a.sort - b.sort)
}

export const plateKeyOf = (plate: string) => plate.replace(/-/g, '')

/** The latest completed inspection of this car that started before `before` (or any, when null). */
export async function fetchPreviousVisit(plateKey: string, before: string | null): Promise<PreviousVisit | null> {
  let query = supabase
    .from('inspections')
    .select('id, odometer_km, completed_at')
    .eq('plate_key', plateKey)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
  if (before) query = query.lt('started_at', before)

  const [visit] = unwrap<Omit<PreviousVisit, 'items'>[]>(await query)
  if (!visit) return null
  return { ...visit, items: await fetchItems(visit.id) }
}

export type InspectionBundle = {
  inspection: Inspection
  items: InspectionItem[]
  previous: PreviousVisit | null
}

/** One inspection with its points and the previous visit of the same car. Null when not found. */
export async function fetchInspection(id: string): Promise<InspectionBundle | null> {
  const inspection = unwrap<Inspection | null>(
    await supabase.from('inspections').select(INSPECTION_COLUMNS).eq('id', id).maybeSingle(),
  )
  if (!inspection) return null
  const [items, previous] = await Promise.all([
    fetchItems(id),
    fetchPreviousVisit(inspection.plate_key, inspection.started_at),
  ])
  return { inspection, items, previous }
}

export async function fetchChecklists(): Promise<Checklist[]> {
  return unwrap(await supabase.from('checklists').select('id, name').order('name'))
}

export type Draft = Pick<Inspection, 'id' | 'plate' | 'checklist_name' | 'started_at'>

export async function fetchMyDrafts(userId: string): Promise<Draft[]> {
  return unwrap(
    await supabase
      .from('inspections')
      .select('id, plate, checklist_name, started_at')
      .eq('status', 'draft')
      .eq('mechanic_id', userId)
      .order('started_at', { ascending: false }),
  )
}

/** A completed inspection with only the points that need a call or a later visit. */
export type CompletedInspection = Pick<
  Inspection,
  'id' | 'plate' | 'odometer_km' | 'checklist_name' | 'note' | 'completed_at'
> & {
  completed_at: string
  findings: Pick<InspectionItem, 'label' | 'block_name' | 'block_sort' | 'sort' | 'status' | 'term' | 'reason' | 'photos'>[]
}

/** Completed inspections of today and the `days - 1` days before, newest first. */
export async function fetchCompleted(days: number): Promise<CompletedInspection[]> {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (days - 1))

  const rows = unwrap<(Omit<CompletedInspection, 'findings'> & { inspection_items: CompletedInspection['findings'] })[]>(
    await supabase
      .from('inspections')
      .select(
        'id, plate, odometer_km, checklist_name, note, completed_at, ' +
          'inspection_items(label, block_name, block_sort, sort, status, term, reason, ' +
          'photos:inspection_photos(id, path, created_at))',
      )
      .eq('status', 'completed')
      .gte('completed_at', since.toISOString())
      // Only limits the embedded points; inspections without any stay in the list.
      .in('inspection_items.status', ['fault', 'advice'])
      .order('completed_at', { ascending: false }),
  )
  for (const row of rows) for (const item of row.inspection_items) item.photos.sort(byCreated)
  return rows.map(({ inspection_items, ...inspection }) => ({ ...inspection, findings: findings(inspection_items) }))
}

export async function startInspection(checklistId: string, plate: string, odometerKm: number): Promise<string> {
  return unwrap(
    await supabase.rpc('start_inspection', {
      p_checklist_id: checklistId,
      p_plate: plate,
      p_odometer_km: odometerKm,
    }),
  )
}

export async function saveItemResults(
  itemIds: string[],
  status: ItemStatus,
  term: AdviceTerm | null,
  reason: string | null,
): Promise<void> {
  unwrap(
    await supabase.rpc('set_item_results', {
      p_item_ids: itemIds,
      p_status: status,
      p_term: term,
      p_reason: reason,
    }),
  )
}

export async function saveReading(readingId: string, value: number | null, orMore: boolean): Promise<void> {
  unwrap(await supabase.rpc('set_reading', { p_reading_id: readingId, p_value: value, p_or_more: orMore }))
}

export async function completeInspection(id: string, note: string): Promise<void> {
  unwrap(await supabase.rpc('complete_inspection', { p_inspection_id: id, p_note: note }))
}

export async function discardInspection(id: string): Promise<void> {
  unwrap(await supabase.rpc('discard_inspection', { p_inspection_id: id }))
}

// Owner: part types and checklists ------------------------------------------

export async function fetchPartTypes(): Promise<PartType[]> {
  return unwrap(await supabase.from('part_types').select('id, name, reasons').order('name'))
}

export async function savePartType(id: string | null, name: string, reasons: string[]): Promise<void> {
  unwrap(await supabase.rpc('admin_save_part_type', { p_id: id, p_name: name, p_reasons: reasons }))
}

export async function deletePartType(id: string): Promise<void> {
  unwrap(await supabase.rpc('admin_delete_part_type', { p_id: id }))
}

export type ChecklistContent = {
  id: string
  name: string
  blocks: {
    name: string
    sort: number
    points: {
      label: string
      sort: number
      part_type_id: string | null
      measurements: {
        label: string
        unit: string
        direction: 'lower_is_worse' | 'higher_is_worse'
        advice_limit: number | null
        fault_limit: number | null
        or_more_value: number | null
        sort: number
      }[]
    }[]
  }[]
}

/** A checklist with all its blocks, points and measurements, in screen order. Null when not found. */
export async function fetchChecklistContent(id: string): Promise<ChecklistContent | null> {
  const checklist = unwrap<ChecklistContent | null>(
    await supabase
      .from('checklists')
      .select(
        'id, name, blocks:checklist_blocks(name, sort, points:checklist_points(label, sort, part_type_id, ' +
          'measurements:checklist_measurements(label, unit, direction, advice_limit, fault_limit, or_more_value, sort)))',
      )
      .eq('id', id)
      .maybeSingle(),
  )
  if (!checklist) return null
  checklist.blocks.sort((a, b) => a.sort - b.sort)
  for (const block of checklist.blocks) {
    block.points.sort((a, b) => a.sort - b.sort)
    for (const point of block.points) point.measurements.sort((a, b) => a.sort - b.sort)
  }
  return checklist
}

/** The blocks as the RPC wants them: part types by name, order by position. */
export type ChecklistPayload = {
  name: string
  points: {
    label: string
    part_type: string | null
    measurements: {
      label: string
      unit: string
      direction: 'lower_is_worse' | 'higher_is_worse'
      advice_limit: number | null
      fault_limit: number | null
      or_more_value: number | null
    }[]
  }[]
}[]

export async function saveChecklist(id: string | null, name: string, blocks: ChecklistPayload): Promise<void> {
  unwrap(await supabase.rpc('admin_save_checklist', { p_id: id, p_name: name, p_blocks: blocks }))
}

export async function deleteChecklist(id: string): Promise<void> {
  unwrap(await supabase.rpc('admin_delete_checklist', { p_id: id }))
}
