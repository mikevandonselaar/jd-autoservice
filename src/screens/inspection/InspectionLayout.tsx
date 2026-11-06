import { useCallback, useMemo, useState } from 'react'
import { Outlet, useParams } from 'react-router'
import { AppShell } from '../../components/AppShell'
import { LinkButton } from '../../components/Button'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import {
  completeInspection,
  discardInspection,
  fetchInspection,
  saveItemResults,
  saveReading,
  type InspectionBundle,
} from '../../inspection/api'
import { InspectionContext, type InspectionContextValue } from '../../inspection/InspectionContext'
import { previousItems } from '../../inspection/rules'
import { useLoad } from '../../lib/useLoad'

/** Loads one inspection and shares it with the checklist, the check and the summary. */
export function InspectionLayout() {
  const { id = '' } = useParams()
  // A key per inspection, so the next one never shows the data of the last.
  return <LoadedInspection key={id} id={id} />
}

function LoadedInspection({ id }: { id: string }) {
  // Null means: not found, or not for you.
  const { state, reload, update } = useLoad<InspectionBundle | null>(() => fetchInspection(id))

  if (state.status === 'loading') {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AppShell>
        <h1 className="text-2xl">Geen verbinding</h1>
        <LoadError onRetry={reload} />
      </AppShell>
    )
  }

  if (!state.data) {
    return (
      <AppShell footer={<LinkButton to="/">Naar het startscherm</LinkButton>}>
        <h1 className="text-2xl">Niet gevonden</h1>
        <Notice>Deze inspectie bestaat niet (meer).</Notice>
      </AppShell>
    )
  }

  return <InspectionProvider bundle={state.data} update={update} reload={reload} />
}

type ProviderProps = {
  bundle: InspectionBundle
  update: (change: (data: InspectionBundle | null) => InspectionBundle | null) => void
  reload: (keepData?: boolean) => void
}

function InspectionProvider({ bundle, update, reload }: ProviderProps) {
  const [saveFailed, setSaveFailed] = useState(false)
  const { inspection } = bundle
  const inspectionId = inspection.id

  // Runs a save. When it fails the server state comes back, so the screen never claims more than is saved.
  const save = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      try {
        await action()
        setSaveFailed(false)
        return true
      } catch {
        setSaveFailed(true)
        reload(true)
        return false
      }
    },
    [reload],
  )

  const setResults = useCallback<InspectionContextValue['setResults']>(
    async (ids, status, term, reason) => {
      const changed = new Set(ids)
      const cleanReason = status === 'open' || status === 'ok' ? null : reason?.trim() || null
      update((data) =>
        data && {
          ...data,
          items: data.items.map((item) =>
            changed.has(item.id) ? { ...item, status, term, reason: cleanReason } : item,
          ),
        },
      )
      await save(() => saveItemResults(ids, status, term, cleanReason))
    },
    [save, update],
  )

  const setReadingValue = useCallback<InspectionContextValue['setReadingValue']>(
    async (readingId, value) => {
      update((data) =>
        data && {
          ...data,
          items: data.items.map((item) => ({
            ...item,
            readings: item.readings.map((reading) => (reading.id === readingId ? { ...reading, value } : reading)),
          })),
        },
      )
      await save(() => saveReading(readingId, value))
    },
    [save, update],
  )

  const complete = useCallback(
    async (note: string) => {
      const saved = await save(() => completeInspection(inspectionId, note))
      if (saved) {
        update((data) =>
          data && {
            ...data,
            inspection: {
              ...data.inspection,
              status: 'completed',
              note: note.trim() || null,
              completed_at: new Date().toISOString(),
            },
          },
        )
        // The server has the exact time of completing.
        reload(true)
      }
      return saved
    },
    [inspectionId, reload, save, update],
  )

  const discard = useCallback(() => save(() => discardInspection(inspectionId)), [inspectionId, save])

  const previousByPoint = useMemo(() => previousItems(bundle.previous), [bundle.previous])

  const value = useMemo<InspectionContextValue>(
    () => ({
      inspection,
      items: bundle.items,
      previous: bundle.previous,
      previousByPoint,
      saveFailed,
      setResults,
      setReadingValue,
      complete,
      discard,
    }),
    [inspection, bundle.items, bundle.previous, previousByPoint, saveFailed, setResults, setReadingValue, complete, discard],
  )

  return (
    <InspectionContext.Provider value={value}>
      <Outlet />
    </InspectionContext.Provider>
  )
}
