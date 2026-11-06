import { createContext, useContext } from 'react'
import type { AdviceTerm, Inspection, InspectionItem, ItemStatus, PreviousVisit } from './types'

export type InspectionContextValue = {
  inspection: Inspection
  items: InspectionItem[]
  previous: PreviousVisit | null
  /** The points of the previous visit by block and name, see rules.ts. */
  previousByPoint: Map<string, InspectionItem>
  /** A save failed: the screen shows what the server has, and says so. */
  saveFailed: boolean
  /** Sets the result of one or more points at once. Shown at once, saved in the background. */
  setResults: (ids: string[], status: ItemStatus, term: AdviceTerm | null, reason: string | null) => Promise<void>
  setReadingValue: (readingId: string, value: number | null) => Promise<void>
  /** Completes the draft. False when it failed. */
  complete: (note: string) => Promise<boolean>
  /** Throws the draft away. False when it failed. */
  discard: () => Promise<boolean>
}

export const InspectionContext = createContext<InspectionContextValue | null>(null)

export function useInspection(): InspectionContextValue {
  const value = useContext(InspectionContext)
  if (!value) throw new Error('useInspection must be used inside InspectionLayout')
  return value
}
