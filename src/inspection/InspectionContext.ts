import { createContext, useContext } from 'react'
import type { AdviceTerm, Inspection, InspectionItem, ItemStatus, Photo, PreviousVisit } from './types'

/** A photo taken on this phone that is not saved yet, or could not be saved. */
export type PendingPhoto = {
  /** Also the file name in the bucket. A retry gets a new one. */
  id: string
  itemId: string
  blob: Blob
  /** Object URL of the blob, to show it before and after saving. */
  previewUrl: string
  failed: boolean
}

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
  /** Saves one measured value; `orMore` says it is "this or more", like 5 mm tread or more. */
  setReadingValue: (readingId: string, value: number | null, orMore?: boolean) => Promise<void>
  /** Saves the note for the front desk while typing. */
  saveNote: (note: string) => Promise<void>
  /** Completes the draft. False when it failed. */
  complete: (note: string) => Promise<boolean>
  /** Throws the draft away, and then its photo files. False when it failed. */
  discard: () => Promise<boolean>
  pendingPhotos: PendingPhoto[]
  /** Makes the photo smaller and saves it in the background. False when the file cannot be read. */
  addPhoto: (itemId: string, file: File) => Promise<boolean>
  retryPhoto: (pending: PendingPhoto) => void
  /** Removes a saved photo. Shown at once, saved in the background. */
  removePhoto: (photo: Photo) => Promise<void>
}

export const InspectionContext = createContext<InspectionContextValue | null>(null)

export function useInspection(): InspectionContextValue {
  const value = useContext(InspectionContext)
  if (!value) throw new Error('useInspection must be used inside InspectionLayout')
  return value
}
