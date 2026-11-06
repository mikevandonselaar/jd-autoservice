import { Icon, type IconName } from '../../components/icons'
import { decisionText, isMeasured, readingsSummary, readingState, suggestedStatus } from '../../inspection/rules'
import type { InspectionItem } from '../../inspection/types'
import { FaultPanel } from './FaultPanel'

const choiceLooks = {
  neutral: 'border-edge bg-surface text-muted',
  good: 'border-good bg-good text-white',
  fault: 'border-fault bg-fault text-white',
  advice: 'border-advice bg-advice text-white',
  hint: 'border-advice bg-advice-tint text-advice-ink',
  open: 'border-charcoal bg-surface text-charcoal',
}

type ChoiceButtonProps = {
  icon: IconName
  label: string
  look: keyof typeof choiceLooks
  pressed: boolean
  expanded?: boolean
  onClick: () => void
}

/** Goed or Fout: a button with the icon above its word, the same size in every row. */
function ChoiceButton({ icon, label, look, pressed, expanded, onClick }: ChoiceButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex h-14 w-[76px] flex-none cursor-pointer flex-col items-center justify-center rounded-sm border-2 text-base font-bold ${choiceLooks[look]}`}
    >
      <Icon name={icon} className="size-5" strokeWidth={2.8} />
      {label}
    </button>
  )
}

type ChecklistRowProps = {
  item: InspectionItem
  /** The point got advice at the previous visit. */
  earlierAdvice: boolean
  /** The result was set by the readings, and the mechanic has not touched it yet. */
  suggested: boolean
  /** The panel with the reason and what to do is open. */
  expanded: boolean
  onGood: () => void
  /** Opens or closes the panel. */
  onFault: () => void
  /** Open the measuring sheet at this measurement. */
  onMeasure: (readingId: string) => void
  /** The mechanic chose something in the panel. */
  onDecided: () => void
  onClosePanel: () => void
}

/**
 * One point of the checklist. Not measured yet: a Meten button. Otherwise Goed and Fout, with
 * the measured values under the name; a tap on them measures again. Fout opens the reason panel.
 */
export function ChecklistRow({
  item,
  earlierAdvice,
  suggested,
  expanded,
  onGood,
  onFault,
  onMeasure,
  onDecided,
  onClosePanel,
}: ChecklistRowProps) {
  const measured = isMeasured(item)
  const needsMeasure = item.status === 'open' && item.readings.length > 0 && !measured
  const measuredCount = item.readings.filter((reading) => reading.value !== null).length
  const summary = readingsSummary(item)
  // Measured values that point to an advice, while the term is still to be chosen.
  const adviceHint =
    item.status === 'open' && suggestedStatus(item.readings.map((reading) => readingState(reading))) === 'advice'

  const tint =
    item.status === 'fault' ? 'bg-fault-tint' : item.status === 'advice' || adviceHint ? 'bg-advice-tint' : item.status === 'repaired' ? 'bg-good-tint' : ''
  const statusColour =
    item.status === 'fault'
      ? 'text-fault-ink'
      : item.status === 'advice' || adviceHint
        ? 'text-advice-ink'
        : item.status === 'ok' || item.status === 'repaired'
          ? 'text-good-ink'
          : 'text-muted'

  let status = decisionText(item)
  if (needsMeasure) status = measuredCount === 0 ? 'Eerst meten' : ''
  else if (adviceHint) status = 'Advies · kies de termijn'
  else if (item.reason) status = `${status} · ${item.reason}`

  const faultLook: ChoiceButtonProps['look'] =
    item.status === 'fault'
      ? 'fault'
      : item.status === 'advice'
        ? 'advice'
        : item.status === 'repaired'
          ? 'good'
          : adviceHint
            ? 'hint'
            : expanded
              ? 'open'
              : 'neutral'
  const faultIcon: IconName = item.status === 'repaired' ? 'wrench' : item.status === 'advice' || adviceHint ? 'clock' : 'warning'
  const faultLabel = item.status === 'repaired' ? 'Hersteld' : item.status === 'advice' || adviceHint ? 'Advies' : 'Fout'

  const note = adviceHint
    ? 'De meting is voorbij de adviesgrens. Kies zelf de termijn.'
    : suggested && item.status === 'fault'
      ? 'De meting is voorbij de foutgrens.'
      : null

  const text = (
    <>
      <b className="block leading-tight font-bold break-words hyphens-auto">{item.label}</b>
      {summary && (
        <span className={`block font-bold ${measured ? 'underline decoration-edge-open underline-offset-4' : 'text-muted'}`}>
          {summary}
          {measured && <Icon name="pencil" className="ml-1.5 inline size-4 align-text-bottom" strokeWidth={2.4} />}
        </span>
      )}
      {(status || suggested) && (
        <span className={`block font-semibold ${statusColour}`}>
          {status}
          {suggested && (
            <span className="ml-1.5 rounded-sm border border-current bg-surface px-1.5 align-baseline text-base font-bold whitespace-nowrap">
              voorstel
            </span>
          )}
        </span>
      )}
      {earlierAdvice && item.status === 'open' && <span className="block font-semibold text-advice-ink">Eerder advies</span>}
    </>
  )

  return (
    <div id={`item-${item.id}`} className={`border-t border-divider px-3.5 py-2 ${tint}`}>
      <div className="flex min-h-14 items-center gap-2">
        {measured ? (
          <button
            type="button"
            onClick={() => onMeasure(item.readings[0].id)}
            aria-label={`${item.label}, ${summary}, meting aanpassen`}
            className="min-h-14 min-w-0 flex-1 cursor-pointer py-1 text-left"
          >
            {text}
          </button>
        ) : (
          <div className="min-w-0 flex-1 py-1">{text}</div>
        )}

        {needsMeasure ? (
          <button
            type="button"
            onClick={() => onMeasure((item.readings.find((reading) => reading.value === null) ?? item.readings[0]).id)}
            className="flex h-14 w-[140px] flex-none cursor-pointer items-center justify-center gap-2 rounded-sm border-2 border-charcoal bg-surface text-lg font-bold text-charcoal"
          >
            <Icon name="ruler" strokeWidth={2.4} />
            Meten
            {measuredCount > 0 && (
              <small className="text-base font-semibold text-muted">
                {measuredCount}/{item.readings.length}
              </small>
            )}
          </button>
        ) : (
          <>
            <ChoiceButton
              icon="check"
              label="Goed"
              look={item.status === 'ok' ? 'good' : 'neutral'}
              pressed={item.status === 'ok'}
              onClick={onGood}
            />
            <ChoiceButton
              icon={faultIcon}
              label={faultLabel}
              look={faultLook}
              pressed={item.status === 'fault' || item.status === 'advice' || item.status === 'repaired'}
              expanded={expanded}
              onClick={onFault}
            />
          </>
        )}
      </div>

      {expanded && !needsMeasure && (
        <FaultPanel item={item} note={note} hintAdvice={adviceHint} onDecided={onDecided} onClose={onClosePanel} />
      )}
    </div>
  )
}
