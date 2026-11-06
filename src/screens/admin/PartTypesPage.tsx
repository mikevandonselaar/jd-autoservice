import { useState } from 'react'
import { AppShell, BackHeader } from '../../components/AppShell'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import { SectionLabel } from '../../components/SectionLabel'
import { TextField } from '../../components/TextField'
import { deletePartType, fetchPartTypes, savePartType } from '../../inspection/api'
import type { PartType } from '../../inspection/types'
import { useLoad } from '../../lib/useLoad'
import { IconButton } from './PointEditor'

const MAX_REASONS = 12

/** Owner: the types of parts, each with the reasons a mechanic can pick for a fault. */
export function PartTypesPage() {
  const { state, reload } = useLoad(fetchPartTypes)
  // `null` is closed, `'new'` a new type, otherwise the type being changed.
  const [editing, setEditing] = useState<PartType | 'new' | null>(null)

  return (
    <AppShell
      headerStart={<BackHeader to="/beheer" label="Terug naar beheer" title="Types onderdelen" />}
      footer={
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" />
          Nieuw type
        </Button>
      }
    >
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && <Notice>Er is nog geen type onderdeel.</Notice>}
      {state.status === 'ready' && state.data.length > 0 && (
        <Card>
          {state.data.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setEditing(type)}
              className="flex min-h-[64px] w-full cursor-pointer items-center gap-3 border-b border-divider px-3.5 py-2 text-left last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{type.name}</span>
                <span className="block truncate text-muted">{type.reasons.join(', ') || 'Geen redenen'}</span>
              </span>
              <Icon name="next" className="size-4 text-charcoal" />
            </button>
          ))}
        </Card>
      )}

      {editing && (
        <PartTypeSheet
          type={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload(true)
          }}
        />
      )}
    </AppShell>
  )
}

type PartTypeSheetProps = {
  type: PartType | null
  onClose: () => void
  onSaved: () => void
}

function PartTypeSheet({ type, onClose, onSaved }: PartTypeSheetProps) {
  const [name, setName] = useState(type?.name ?? '')
  const [reasons, setReasons] = useState<string[]>(type?.reasons ?? [])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      onSaved()
    } catch (error) {
      const duplicate = (error as { code?: string }).code === '23505'
      setProblem(duplicate ? 'Er bestaat al een type met deze naam.' : failure)
      setBusy(false)
    }
  }

  function save() {
    const cleaned = reasons.map((reason) => reason.trim()).filter(Boolean)
    if (name.trim() === '') return setProblem('Geef het type een naam.')
    if (new Set(cleaned.map((reason) => reason.toLowerCase())).size !== cleaned.length) {
      return setProblem('Elke reden komt maar één keer voor.')
    }
    return run(() => savePartType(type?.id ?? null, name.trim(), cleaned), 'Opslaan lukt nu niet. Controleer je verbinding.')
  }

  if (confirmDelete && type) {
    return (
      <BottomSheet
        title="Type verwijderen?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <div className="flex flex-col gap-2.5">
            <Button
              disabled={busy}
              onClick={() => void run(() => deletePartType(type.id), 'Verwijderen lukt nu niet.')}
            >
              Ja, verwijderen
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Nee, bewaren
            </Button>
          </div>
        }
      >
        {problem && <Notice tone="fault">{problem}</Notice>}
        <p>
          Punten met het type “{type.name}” blijven bestaan, maar bieden geen redenen meer aan bij een fout.
        </p>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      title={type ? 'Type aanpassen' : 'Nieuw type'}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2.5">
          <Button disabled={busy} onClick={() => void save()}>
            Opslaan
          </Button>
          {type && (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" />
              Type verwijderen
            </Button>
          )}
        </div>
      }
    >
      {problem && <Notice tone="fault">{problem}</Notice>}
      <TextField
        id="part-type-name"
        label="Naam"
        value={name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
      />
      <SectionLabel>Redenen bij een fout</SectionLabel>
      <p className="-mt-1 text-muted">“Anders” met een eigen tekst staat er altijd bij.</p>
      {reasons.map((reason, index) => (
        <div key={index} className="flex items-end gap-1">
          <div className="min-w-0 flex-1">
            <TextField
              id={`reason-${index}`}
              label={`Reden ${index + 1}`}
              value={reason}
              maxLength={40}
              onChange={(event) => setReasons(reasons.map((r, i) => (i === index ? event.target.value : r)))}
            />
          </div>
          <IconButton
            label={`Reden ${index + 1} verwijderen`}
            icon="trash"
            onClick={() => setReasons(reasons.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button variant="secondary" disabled={reasons.length >= MAX_REASONS} onClick={() => setReasons([...reasons, ''])}>
        <Icon name="plus" />
        Reden toevoegen
      </Button>
    </BottomSheet>
  )
}
