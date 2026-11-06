import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import {
  deleteChecklist,
  fetchChecklistContent,
  fetchChecklists,
  fetchPartTypes,
  saveChecklist,
} from '../../inspection/api'
import type { Checklist } from '../../inspection/types'
import { useLoad } from '../../lib/useLoad'
import { draftFromContent, toPayload } from './checklistDraft'

/** The name of a copy: "Grote beurt (kopie)", or with a number when that exists too. */
function copyName(name: string, taken: Set<string>): string {
  const base = name.slice(0, 40)
  let candidate = `${base} (kopie)`
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} (kopie ${n})`
  return candidate
}

export function ChecklistsPage() {
  const navigate = useNavigate()
  const { state, reload } = useLoad(fetchChecklists)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Checklist | null>(null)

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      reload(true)
    } catch {
      setProblem(failure)
    } finally {
      setBusy(false)
    }
  }

  function copy(checklist: Checklist, taken: Set<string>) {
    return run(async () => {
      const [content, partTypes] = await Promise.all([fetchChecklistContent(checklist.id), fetchPartTypes()])
      if (!content) throw new Error('checklist is gone')
      await saveChecklist(null, copyName(checklist.name, taken), toPayload(draftFromContent(content), partTypes))
    }, 'Kopiëren lukt nu niet.')
  }

  async function confirmDelete(checklist: Checklist) {
    await run(() => deleteChecklist(checklist.id), 'Verwijderen lukt nu niet.')
    setDeleting(null)
  }

  const list = state.status === 'ready' ? state.data : []
  const taken = new Set(list.map((checklist) => checklist.name))

  return (
    <AppShell
      headerStart={<BackHeader to="/beheer" label="Terug naar beheer" title="Checklists" />}
      footer={
        <Button onClick={() => navigate('/beheer/checklists/nieuw')}>
          <Icon name="plus" />
          Nieuwe checklist
        </Button>
      }
    >
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={reload} />}
      {problem && <Notice tone="fault">{problem}</Notice>}
      {state.status === 'ready' && list.length === 0 && <Notice>Er is nog geen checklist.</Notice>}

      {list.map((checklist) => (
        <Card key={checklist.id} className="flex flex-col gap-2.5 p-3.5">
          <h2 className="text-lg">{checklist.name}</h2>
          <div className="grid grid-cols-3 gap-2">
            <LinkButton
              to={`/beheer/checklists/${checklist.id}`}
              variant="secondary"
              className="min-h-14 px-2 text-base"
            >
              Bewerk
            </LinkButton>
            <Button
              variant="secondary"
              disabled={busy}
              className="min-h-14 px-2 text-base"
              onClick={() => void copy(checklist, taken)}
            >
              Kopieer
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              className="min-h-14 px-2 text-base"
              onClick={() => setDeleting(checklist)}
            >
              Verwijder
            </Button>
          </div>
        </Card>
      ))}

      {deleting && (
        <BottomSheet
          title="Checklist verwijderen?"
          onClose={() => setDeleting(null)}
          footer={
            <div className="flex flex-col gap-2.5">
              <Button disabled={busy} onClick={() => void confirmDelete(deleting)}>
                Ja, verwijderen
              </Button>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Nee, bewaren
              </Button>
            </div>
          }
        >
          <p>
            “{deleting.name}” verdwijnt uit de lijst. Inspecties die al gedaan zijn, blijven zoals ze waren.
          </p>
        </BottomSheet>
      )}
    </AppShell>
  )
}
