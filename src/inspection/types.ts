export type ItemStatus = 'open' | 'ok' | 'repaired' | 'advice' | 'fault'
export type AdviceTerm = 'next_service' | 'few_months'
export type Direction = 'lower_is_worse' | 'higher_is_worse'

export type Reading = {
  id: string
  item_id: string
  label: string
  unit: string
  direction: Direction
  advice_limit: number | null
  fault_limit: number | null
  /** The quick value "this or more", for example 5 mm of tyre tread. Null: none. */
  or_more_value: number | null
  sort: number
  value: number | null
  /** The value is "or more": at least `value`, not measured exactly. */
  or_more: boolean
}

/** A photo of a point. The file is in the bucket at `path`, see photos.ts. */
export type Photo = {
  id: string
  path: string
  created_at: string
}

/** One point of an inspection, with its own copy of the checklist data. */
export type InspectionItem = {
  id: string
  inspection_id: string
  block_name: string
  block_sort: number
  label: string
  sort: number
  reason_options: string[]
  status: ItemStatus
  term: AdviceTerm | null
  reason: string | null
  readings: Reading[]
  /** Oldest first. */
  photos: Photo[]
}

export type Inspection = {
  id: string
  plate: string
  plate_key: string
  odometer_km: number
  checklist_name: string
  mechanic_id: string
  status: 'draft' | 'completed'
  note: string | null
  started_at: string
  completed_at: string | null
}

/** The latest completed inspection of the same car before this one. */
export type PreviousVisit = {
  id: string
  odometer_km: number
  completed_at: string
  items: InspectionItem[]
}

export type Checklist = { id: string; name: string }

export type PartType = { id: string; name: string; reasons: string[] }
