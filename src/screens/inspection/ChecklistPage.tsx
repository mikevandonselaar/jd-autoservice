import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useEmployee } from '../../auth/AuthProvider'
import { Accordion } from '../../components/Accordion'
import { AppShell } from '../../components/AppShell'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { MeasureCard } from '../../components/MeasureCard'
import { Notice } from '../../components/Notice'
import { PlateBadge } from '../../components/PlateBadge'
import { ProgressBar } from '../../components/ProgressBar'
import { SectionLabel } from '../../components/SectionLabel'
import { StatusTile } from '../../components/StatusTile'
import { UndoToast } from '../../components/UndoToast'
import { useInspection } from '../../inspection/InspectionContext'
import { countByStatus, countReadings, priorAdvice, readingState } from '../../inspection/rules'
import type { InspectionItem } from '../../inspection/types'
import { formatKm } from '../../lib/format'
import { FaultSheet } from './FaultSheet'
import { MeasureSheet } from './MeasureSheet'

type Sheet =
  | { kind: 'measure'; itemId: string; readingId: string }
  | { kind: 'fault'; itemId: string; suggest: 'fault' | 'advice' | null }
  | { kind: 'discard' }

type Block = { sort: number; name: string; items: InspectionItem[] }

/** The items come sorted by block, so a block is a run of items with the same block_sort. */
function groupBlocks(items: InspectionItem[]): Block[] {
  const blocks: Block[] = []
  for (const item of items) {
    const last = blocks[blocks.length - 1]
    if (last && last.sort === item.block_sort) last.items.push(item)
    else blocks.push({ sort: item.block_sort, name: item.block_name, items: [item] })
  }
  return blocks
}

/** M2: the blocks of the checklist, with the measurements on top. */
export function ChecklistPage() {
  const employee = useEmployee()
  const navigate = useNavigate()
  const { inspection, items, previousByPoint, saveFailed, setResults, discard } = useInspection()
  const blocks = useMemo(() => groupBlocks(items), [items])
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Starts on the first block that still has open points.
  const [expanded, setExpanded] = useState<number | null>(
    () => (blocks.find((block) => block.items.some((item) => item.status === 'open')) ?? blocks[0])?.sort ?? null,
  )
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // The points that "Rest goed" just set, so Herstel can put them back.
  const [undo, setUndo] = useState<string[] | null>(null)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  if (inspection.status === 'completed') return <Navigate to={`/inspectie/${inspection.id}/klaar`} replace />

  const open = countByStatus(items).open
  const readings = countReadings(items)
  const cards = items.flatMap((item) => item.readings.map((reading) => ({ item, reading })))
  const sheetItem = sheet && sheet.kind !== 'discard' ? items.find((item) => item.id === sheet.itemId) : undefined

  function tap(item: InspectionItem) {
    setUndo(null)
    if (item.status === 'open') void setResults([item.id], 'ok', null, null)
    else if (item.status === 'ok') setSheet({ kind: 'fault', itemId: item.id, suggest: null })
    else void setResults([item.id], 'open', null, null)
  }

  function restOk(block: Block) {
    const ids = block.items.filter((item) => item.status === 'open').map((item) => item.id)
    void setResults(ids, 'ok', null, null)
    setUndo(ids)
  }

  function undoRestOk() {
    if (undo) void setResults(undo, 'open', null, null)
    setUndo(null)
  }

  async function confirmDiscard() {
    setDiscarding(true)
    if (await discard()) navigate('/', { replace: true })
    else {
      setDiscarding(false)
      setSheet(null)
    }
  }

  return (
    <AppShell
      headerStart={
        <div className="flex items-center gap-2.5 px-4">
          <PlateBadge plate={inspection.plate} />
          <span className="font-semibold whitespace-nowrap text-muted">{formatKm(inspection.odometer_km)} km</span>
        </div>
      }
      panel={employee.name}
      subheader={
        <div className={`grid gap-3.5 ${readings.total > 0 ? 'grid-cols-2' : ''}`}>
          {readings.total > 0 && <ProgressBar label="Metingen" done={readings.done} total={readings.total} />}
          <ProgressBar label="Punten" done={items.length - open} total={items.length} />
        </div>
      }
      footer={
        open > 0 ? (
          <Button disabled>
            <Icon name="lock" strokeWidth={2.6} />
            Afronden · {open} open
          </Button>
        ) : (
          <LinkButton to={`/inspectie/${inspection.id}/controle`}>
            Afronden
            <Icon name="next" />
          </LinkButton>
        )
      }
    >
      {saveFailed && (
        <Notice tone="fault">Opslaan lukt nu niet. Controleer je verbinding. Je laatste tik is niet bewaard.</Notice>
      )}

      <div className="flex items-center gap-2.5">
        <span className="flex-1 text-muted">Tik: open → goed → niet goed</span>
        <button
          type="button"
          aria-pressed={onlyOpen}
          onClick={() => setOnlyOpen(!onlyOpen)}
          className="inline-flex min-h-14 cursor-pointer items-center gap-2 rounded-sm border-2 border-charcoal bg-surface px-3 font-bold text-charcoal"
        >
          <span
            className={`flex size-5 items-center justify-center rounded-sm border-2 border-charcoal ${onlyOpen ? 'bg-charcoal text-white' : ''}`}
          >
            {onlyOpen && <Icon name="check" className="size-3" />}
          </span>
          Alleen open
        </button>
      </div>

      {cards.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Metingen</SectionLabel>
            <span className="text-muted">Tik om te meten</span>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {cards.map(({ item, reading }) => (
              <MeasureCard
                key={reading.id}
                label={item.readings.length > 1 ? `${item.label} ${reading.label}` : item.label}
                value={reading.value}
                unit={reading.unit}
                state={readingState(reading)}
                onTap={() => setSheet({ kind: 'measure', itemId: item.id, readingId: reading.id })}
              />
            ))}
          </div>
        </section>
      )}

      {onlyOpen && open === 0 && <Notice>Alle punten zijn ingevuld.</Notice>}

      <Card className="overflow-hidden">
        {blocks.map((block, index) => {
          const blockOpen = block.items.filter((item) => item.status === 'open')
          if (onlyOpen && blockOpen.length === 0) return null
          const earlier = blockOpen.filter((item) => priorAdvice(previousByPoint, item)).length
          return (
            <Accordion
              key={block.sort}
              title={block.name}
              badge={blockOpen.length === 0 ? <Icon name="check" className="size-4" strokeWidth={3.2} /> : index + 1}
              complete={blockOpen.length === 0}
              marker={
                earlier > 0 && (
                  <span className="rounded-sm border-2 border-advice bg-advice-tint px-1.5 py-0.5 font-sans text-base font-bold tracking-normal text-advice-ink normal-case">
                    {earlier} eerder
                  </span>
                )
              }
              count={`${block.items.length - blockOpen.length}/${block.items.length}`}
              open={expanded === block.sort}
              onToggle={() => setExpanded(expanded === block.sort ? null : block.sort)}
            >
              <div className="grid grid-cols-2 gap-1.5">
                {(onlyOpen ? blockOpen : block.items).map((item) => (
                  <StatusTile
                    key={item.id}
                    item={item}
                    earlierAdvice={priorAdvice(previousByPoint, item) !== undefined}
                    onTap={() => tap(item)}
                  />
                ))}
              </div>
              {blockOpen.length > 0 && (
                <Button variant="secondary" onClick={() => restOk(block)}>
                  <Icon name="check" />
                  Rest goed ({blockOpen.length})
                </Button>
              )}
            </Accordion>
          )
        })}
      </Card>

      <div className="flex flex-col gap-2.5">
        <LinkButton to="/" variant="secondary">
          Sluiten, later verder
        </LinkButton>
        <Button variant="secondary" onClick={() => setSheet({ kind: 'discard' })}>
          <Icon name="trash" />
          Inspectie weggooien
        </Button>
      </div>

      {undo && <UndoToast text={`${undo.length} punten op goed gezet`} onUndo={undoRestOk} />}

      {sheet?.kind === 'measure' && sheetItem && (
        <MeasureSheet
          item={sheetItem}
          readingId={sheet.readingId}
          onClose={() => setSheet(null)}
          onFinish={(suggest) =>
            setSheet(
              suggest && (sheetItem.status === 'open' || sheetItem.status === 'ok')
                ? { kind: 'fault', itemId: sheetItem.id, suggest }
                : null,
            )
          }
        />
      )}
      {sheet?.kind === 'fault' && sheetItem && (
        <FaultSheet item={sheetItem} suggest={sheet.suggest} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'discard' && (
        <BottomSheet
          title="Weggooien?"
          onClose={() => setSheet(null)}
          footer={
            <div className="flex flex-col gap-2.5">
              <Button disabled={discarding} onClick={() => void confirmDiscard()}>
                Ja, weggooien
              </Button>
              <Button variant="secondary" onClick={() => setSheet(null)}>
                Nee, bewaren
              </Button>
            </div>
          }
        >
          <p>
            De inspectie van {inspection.plate} met alles wat je hebt ingevuld verdwijnt. Dit kun je niet terugdraaien.
          </p>
        </BottomSheet>
      )}
    </AppShell>
  )
}
