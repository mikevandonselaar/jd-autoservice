import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useEmployee } from '../../auth/AuthProvider'
import { Accordion } from '../../components/Accordion'
import { AppShell } from '../../components/AppShell'
import { BottomSheet } from '../../components/BottomSheet'
import { Button, LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { PlateBadge } from '../../components/PlateBadge'
import { ProgressBar } from '../../components/ProgressBar'
import { UndoToast } from '../../components/UndoToast'
import { useInspection } from '../../inspection/InspectionContext'
import { formatPlate } from '../../inspection/plate'
import { countByStatus, countReadings, priorAdvice, readingState, suggestedStatus } from '../../inspection/rules'
import type { InspectionItem, Reading } from '../../inspection/types'
import { formatKm } from '../../lib/format'
import { ChecklistRow } from './ChecklistRow'
import { MeasureSheet } from './MeasureSheet'

type Sheet = { kind: 'measure'; itemId: string; readingId: string } | { kind: 'discard' }

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

/** M2: the blocks of the checklist, one row per point. */
export function ChecklistPage() {
  const employee = useEmployee()
  const navigate = useNavigate()
  // The check can send you back to change one point: its panel is open and in view.
  const expandId = (useLocation().state as { expand?: string } | null)?.expand ?? null
  const { inspection, items, previousByPoint, saveFailed, setResults, discard } = useInspection()
  const blocks = useMemo(() => groupBlocks(items), [items])
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Starts on the block of the point to change, or the first block that still has open points.
  const [expanded, setExpanded] = useState<number | null>(() => {
    const wanted = blocks.find((block) => block.items.some((item) => item.id === expandId))
    return (
      (wanted ?? blocks.find((block) => block.items.some((item) => item.status === 'open')) ?? blocks[0])?.sort ?? null
    )
  })
  // The point with the reason panel open.
  const [panelId, setPanelId] = useState<string | null>(expandId)
  // Points whose result the readings set and the mechanic has not changed yet.
  const [suggested, setSuggested] = useState<ReadonlySet<string>>(new Set())
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // The points that "Rest goed" just set, so Herstel can put them back.
  const [undo, setUndo] = useState<string[] | null>(null)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  useEffect(() => {
    if (expandId) document.getElementById(`item-${expandId}`)?.scrollIntoView({ block: 'center' })
  }, [expandId])

  if (inspection.status === 'completed') return <Navigate to={`/inspectie/${inspection.id}/klaar`} replace />

  const open = countByStatus(items).open
  const readings = countReadings(items)
  const sheetItem = sheet?.kind === 'measure' ? items.find((item) => item.id === sheet.itemId) : undefined

  function markSuggested(id: string, on: boolean) {
    setSuggested((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function good(item: InspectionItem) {
    setUndo(null)
    setPanelId(null)
    markSuggested(item.id, false)
    void setResults([item.id], 'ok', null, null)
  }

  function fault(item: InspectionItem) {
    setUndo(null)
    setPanelId(panelId === item.id ? null : item.id)
  }

  /** The measuring sheet is done: the readings suggest the result, the mechanic can still change it. */
  function finishMeasuring(item: InspectionItem, values: Reading[]) {
    setSheet(null)
    const target = suggestedStatus(values.map((reading) => readingState(reading)))
    // Only a point that is still open, or still carries an earlier suggestion, is set by the readings.
    if (!target || !(item.status === 'open' || suggested.has(item.id))) return

    if (target === 'ok') {
      if (item.status !== 'ok') void setResults([item.id], 'ok', null, null)
      setPanelId(null)
    } else if (target === 'fault') {
      if (item.status !== 'fault') void setResults([item.id], 'fault', null, null)
      setPanelId(item.id)
    } else {
      // An advice needs a term, which the mechanic chooses: the point stays open until then.
      if (item.status !== 'open') void setResults([item.id], 'open', null, null)
      setPanelId(item.id)
    }
    markSuggested(item.id, true)
  }

  function restOk(block: Block) {
    // A point with measurements is done by measuring it.
    const ids = block.items.filter((item) => item.status === 'open' && item.readings.length === 0).map((item) => item.id)
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
        <span className="flex-1 text-muted">Goed of Fout per punt. Bij een meting eerst Meten, of meteen Fout.</span>
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

      {onlyOpen && open === 0 && <Notice>Alle punten zijn ingevuld.</Notice>}

      <Card className="overflow-hidden">
        {blocks.map((block, index) => {
          const blockOpen = block.items.filter((item) => item.status === 'open')
          if (onlyOpen && blockOpen.length === 0 && !block.items.some((item) => item.id === panelId)) return null
          const earlier = blockOpen.filter((item) => priorAdvice(previousByPoint, item)).length
          const restCount = blockOpen.filter((item) => item.readings.length === 0).length
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
              {block.items
                .filter((item) => !onlyOpen || item.status === 'open' || item.id === panelId)
                .map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    earlierAdvice={priorAdvice(previousByPoint, item) !== undefined}
                    suggested={suggested.has(item.id)}
                    expanded={panelId === item.id}
                    onGood={() => good(item)}
                    onFault={() => fault(item)}
                    onMeasure={(readingId) => {
                      setUndo(null)
                      setSheet({ kind: 'measure', itemId: item.id, readingId })
                    }}
                    onDecided={() => markSuggested(item.id, false)}
                    onClosePanel={() => setPanelId(null)}
                  />
                ))}
              {restCount > 0 && (
                <div className="border-t border-divider p-3">
                  <Button variant="secondary" onClick={() => restOk(block)}>
                    <Icon name="check" />
                    Rest goed ({restCount})
                  </Button>
                </div>
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
          key={sheetItem.id}
          item={sheetItem}
          readingId={sheet.readingId}
          onClose={() => setSheet(null)}
          onFinish={(values) => finishMeasuring(sheetItem, values)}
        />
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
            De inspectie van {formatPlate(inspection.plate)} met alles wat je hebt ingevuld verdwijnt. Dit kun je niet terugdraaien.
          </p>
        </BottomSheet>
      )}
    </AppShell>
  )
}
