import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { fetchChecklistContent, fetchPartTypes, saveChecklist, type ChecklistContent } from '../../inspection/api'
import type { PartType } from '../../inspection/types'
import { useLoad } from '../../lib/useLoad'
import {
  draftFromContent,
  emptyDraft,
  move,
  newBlock,
  newPoint,
  toPayload,
  validate,
  type Draft,
  type DraftBlock,
  type DraftPoint,
} from './checklistDraft'
import { IconButton, PointEditor } from './PointEditor'

const MAX_BLOCKS = 20
const MAX_POINTS = 60

const replaceAt = <T,>(list: T[], index: number, next: T): T[] => list.map((item, i) => (i === index ? next : item))

/** Owner: change one checklist, or make a new one ("nieuw"). Saved in one go. */
export function ChecklistEditorPage() {
  const { id = '' } = useParams()
  const isNew = id === 'nieuw'
  const { state, reload } = useLoad(async () => {
    const [content, partTypes] = await Promise.all([isNew ? null : fetchChecklistContent(id), fetchPartTypes()])
    return { content, partTypes }
  })

  const header = (
    <BackHeader
      to="/beheer/checklists"
      label="Terug naar de checklists"
      title={isNew ? 'Nieuwe checklist' : 'Checklist'}
    />
  )

  if (state.status === 'loading') {
    return (
      <AppShell headerStart={header}>
        <Loading />
      </AppShell>
    )
  }
  if (state.status === 'error') {
    return (
      <AppShell headerStart={header}>
        <LoadError onRetry={reload} />
      </AppShell>
    )
  }
  if (!isNew && !state.data.content) {
    return (
      <AppShell headerStart={header}>
        <Notice>Deze checklist bestaat niet (meer).</Notice>
      </AppShell>
    )
  }
  return <Editor key={id} id={isNew ? null : id} content={state.data.content} partTypes={state.data.partTypes} header={header} />
}

type EditorProps = {
  id: string | null
  content: ChecklistContent | null
  partTypes: PartType[]
  header: ReactNode
}

function Editor({ id, content, partTypes, header }: EditorProps) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => (content ? draftFromContent(content) : emptyDraft()))
  const [openBlock, setOpenBlock] = useState<string | null>(() => draft.blocks[0]?.key ?? null)
  const [openPoint, setOpenPoint] = useState<string | null>(() => (content ? null : (draft.blocks[0]?.points[0]?.key ?? null)))
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setBlock = (index: number, change: (block: DraftBlock) => DraftBlock) =>
    setDraft((d) => ({ ...d, blocks: replaceAt(d.blocks, index, change(d.blocks[index])) }))

  const setPoint = (blockIndex: number, pointIndex: number, next: DraftPoint) =>
    setBlock(blockIndex, (block) => ({ ...block, points: replaceAt(block.points, pointIndex, next) }))

  function addBlock() {
    const block = newBlock()
    setDraft((d) => ({ ...d, blocks: [...d.blocks, block] }))
    setOpenBlock(block.key)
    setOpenPoint(block.points[0].key)
  }

  function addPoint(blockIndex: number) {
    const point = newPoint()
    setBlock(blockIndex, (block) => ({ ...block, points: [...block.points, point] }))
    setOpenPoint(point.key)
  }

  async function save() {
    const message = validate(draft)
    setProblem(message)
    if (message) return
    setSaving(true)
    try {
      await saveChecklist(id, draft.name.trim(), toPayload(draft, partTypes))
      navigate('/beheer/checklists')
    } catch (error) {
      const duplicate = (error as { code?: string }).code === '23505'
      setProblem(
        duplicate ? 'Er bestaat al een checklist met deze naam.' : 'Opslaan lukt nu niet. Controleer je verbinding.',
      )
      setSaving(false)
    }
  }

  return (
    <AppShell
      headerStart={header}
      footer={
        <>
          {/* In the footer, so it is in view whatever part of the checklist you are editing. */}
          {problem && <Notice tone="fault">{problem}</Notice>}
          <Button disabled={saving} onClick={() => void save()}>
            Opslaan
          </Button>
        </>
      }
    >
      <TextField
        id="checklist-name"
        label="Naam van de checklist"
        value={draft.name}
        maxLength={60}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />

      {draft.blocks.map((block, blockIndex) => {
        const open = openBlock === block.key
        return (
          <Card key={block.key}>
            <div className="flex items-center">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenBlock(open ? null : block.key)}
                className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3.5 text-left"
              >
                <Icon name="next" className={`size-4 text-charcoal ${open ? 'rotate-90' : ''}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading font-bold tracking-[0.04em] uppercase">
                    {block.name.trim() || 'Nieuw blok'}
                  </span>
                  <span className="block text-muted">{block.points.length} {block.points.length === 1 ? 'punt' : 'punten'}</span>
                </span>
              </button>
              <IconButton
                label="Blok omhoog"
                icon="up"
                disabled={blockIndex === 0}
                onClick={() => setDraft((d) => ({ ...d, blocks: move(d.blocks, blockIndex, -1) }))}
              />
              <IconButton
                label="Blok omlaag"
                icon="down"
                disabled={blockIndex === draft.blocks.length - 1}
                onClick={() => setDraft((d) => ({ ...d, blocks: move(d.blocks, blockIndex, 1) }))}
              />
            </div>

            {open && (
              <div className="flex flex-col gap-3 border-t border-divider p-3.5">
                <TextField
                  id={`${block.key}-name`}
                  label="Naam van het blok"
                  value={block.name}
                  maxLength={60}
                  onChange={(event) => setBlock(blockIndex, (b) => ({ ...b, name: event.target.value }))}
                />
                {block.points.map((point, pointIndex) => (
                  <PointEditor
                    key={point.key}
                    point={point}
                    partTypes={partTypes}
                    open={openPoint === point.key}
                    isFirst={pointIndex === 0}
                    isLast={pointIndex === block.points.length - 1}
                    canRemove={block.points.length > 1}
                    onToggle={() => setOpenPoint(openPoint === point.key ? null : point.key)}
                    onChange={(next) => setPoint(blockIndex, pointIndex, next)}
                    onMove={(delta) =>
                      setBlock(blockIndex, (b) => ({ ...b, points: move(b.points, pointIndex, delta) }))
                    }
                    onRemove={() =>
                      setBlock(blockIndex, (b) => ({ ...b, points: b.points.filter((_, i) => i !== pointIndex) }))
                    }
                  />
                ))}
                <Button variant="secondary" disabled={block.points.length >= MAX_POINTS} onClick={() => addPoint(blockIndex)}>
                  <Icon name="plus" />
                  Punt toevoegen
                </Button>
                <Button
                  variant="secondary"
                  disabled={draft.blocks.length <= 1}
                  onClick={() => setDraft((d) => ({ ...d, blocks: d.blocks.filter((_, i) => i !== blockIndex) }))}
                >
                  <Icon name="trash" />
                  Blok verwijderen
                </Button>
              </div>
            )}
          </Card>
        )
      })}

      <Button variant="secondary" disabled={draft.blocks.length >= MAX_BLOCKS} onClick={addBlock}>
        <Icon name="plus" />
        Blok toevoegen
      </Button>
    </AppShell>
  )
}
