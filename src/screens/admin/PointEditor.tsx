import { Button } from '../../components/Button'
import { Icon, type IconName } from '../../components/icons'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import type { Direction, PartType } from '../../inspection/types'
import { move, newMeasurement, type DraftMeasurement, type DraftPoint } from './checklistDraft'

/** Digits only, at most `length`, for the age and mileage of a point. */
const digits = (text: string, length: number) => text.replace(/\D/g, '').slice(0, length)

export function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: IconName
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-14 flex-none cursor-pointer items-center justify-center text-charcoal disabled:cursor-not-allowed disabled:text-edge"
    >
      <Icon name={icon} className="size-5" />
    </button>
  )
}

type PointEditorProps = {
  point: DraftPoint
  partTypes: PartType[]
  open: boolean
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  onToggle: () => void
  onChange: (point: DraftPoint) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

const MAX_MEASUREMENTS = 10

/** One point of a checklist: a row that opens into its fields and measurements. */
export function PointEditor({
  point,
  partTypes,
  open,
  isFirst,
  isLast,
  canRemove,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: PointEditorProps) {
  const partType = partTypes.find((type) => type.id === point.partTypeId)
  const count = point.measurements.length
  const from = [point.minAge.trim() && `${point.minAge.trim()} jaar`, point.minKm.trim() && `${point.minKm.trim()} km`]
    .filter(Boolean)
    .join(' of ')
  const summary = [
    partType?.name,
    count > 0 && `${count} ${count === 1 ? 'meting' : 'metingen'}`,
    from && `vanaf ${from}`,
  ]
    .filter(Boolean)
    .join(' · ')

  function changeMeasurement(index: number, change: Partial<DraftMeasurement>) {
    onChange({
      ...point,
      measurements: point.measurements.map((m, i) => (i === index ? { ...m, ...change } : m)),
    })
  }

  return (
    <div className="rounded-sm border border-divider">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left"
        >
          <Icon name="next" className={`size-4 text-charcoal ${open ? 'rotate-90' : ''}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{point.label.trim() || 'Nieuw punt'}</span>
            {summary && <span className="block truncate text-muted">{summary}</span>}
          </span>
        </button>
        <IconButton label="Punt omhoog" icon="up" disabled={isFirst} onClick={() => onMove(-1)} />
        <IconButton label="Punt omlaag" icon="down" disabled={isLast} onClick={() => onMove(1)} />
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-divider p-3">
          <TextField
            id={`${point.key}-label`}
            label="Naam van het punt"
            value={point.label}
            maxLength={80}
            onChange={(event) => onChange({ ...point, label: event.target.value })}
          />
          <SelectField
            id={`${point.key}-type`}
            label="Type onderdeel"
            value={point.partTypeId}
            onChange={(event) => onChange({ ...point, partTypeId: event.target.value })}
          >
            <option value="">Geen</option>
            {partTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </SelectField>

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2.5">
              <TextField
                id={`${point.key}-min-age`}
                label="Alleen vanaf (jaar)"
                inputMode="numeric"
                value={point.minAge}
                onChange={(event) => onChange({ ...point, minAge: digits(event.target.value, 3) })}
              />
              <TextField
                id={`${point.key}-min-km`}
                label="Of vanaf (km)"
                inputMode="numeric"
                value={point.minKm}
                onChange={(event) => onChange({ ...point, minKm: digits(event.target.value, 7) })}
              />
            </div>
            <span className="text-base text-muted">
              Leeg laten voor elke auto. Anders komt het punt alleen bij een auto van die leeftijd of met die
              kilometerstand, bijvoorbeeld koelvloeistof vanaf 10 jaar.
            </span>
          </div>

          {point.measurements.map((measurement, index) => (
            <div key={measurement.key} className="flex flex-col gap-2.5 rounded-sm bg-canvas p-3">
              <div className="flex items-center">
                <p className="flex-1 font-semibold">Meting {index + 1}</p>
                <IconButton
                  label="Meting omhoog"
                  icon="up"
                  disabled={index === 0}
                  onClick={() => onChange({ ...point, measurements: move(point.measurements, index, -1) })}
                />
                <IconButton
                  label="Meting omlaag"
                  icon="down"
                  disabled={index === point.measurements.length - 1}
                  onClick={() => onChange({ ...point, measurements: move(point.measurements, index, 1) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <TextField
                  id={`${measurement.key}-label`}
                  label="Naam"
                  placeholder="bijvoorbeeld LV"
                  value={measurement.label}
                  maxLength={20}
                  onChange={(event) => changeMeasurement(index, { label: event.target.value })}
                />
                <TextField
                  id={`${measurement.key}-unit`}
                  label="Eenheid"
                  value={measurement.unit}
                  maxLength={10}
                  onChange={(event) => changeMeasurement(index, { unit: event.target.value })}
                />
              </div>
              <SelectField
                id={`${measurement.key}-direction`}
                label="Slechter als de waarde"
                value={measurement.direction}
                onChange={(event) => changeMeasurement(index, { direction: event.target.value as Direction })}
              >
                <option value="lower_is_worse">lager wordt (profiel, voering, accu)</option>
                <option value="higher_is_worse">hoger wordt (vocht in remvloeistof, vriespunt)</option>
              </SelectField>
              <div className="grid grid-cols-2 gap-2.5">
                <TextField
                  id={`${measurement.key}-advice`}
                  label="Adviesgrens"
                  inputMode="decimal"
                  value={measurement.advice}
                  onChange={(event) => changeMeasurement(index, { advice: event.target.value })}
                />
                <TextField
                  id={`${measurement.key}-fault`}
                  label="Foutgrens"
                  inputMode="decimal"
                  value={measurement.fault}
                  onChange={(event) => changeMeasurement(index, { fault: event.target.value })}
                />
              </div>
              {measurement.direction === 'lower_is_worse' && (
                <TextField
                  id={`${measurement.key}-or-more`}
                  label="Snelkeuze 'of meer' vanaf"
                  hint="Bijvoorbeeld 5 bij banden: één tik vult dan '5 of meer' in. Leeg laten voor niets."
                  inputMode="decimal"
                  value={measurement.orMore}
                  onChange={(event) => changeMeasurement(index, { orMore: event.target.value })}
                />
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  onChange({ ...point, measurements: point.measurements.filter((_, i) => i !== index) })
                }
              >
                <Icon name="trash" />
                Meting verwijderen
              </Button>
            </div>
          ))}

          <Button
            variant="secondary"
            disabled={point.measurements.length >= MAX_MEASUREMENTS}
            onClick={() => onChange({ ...point, measurements: [...point.measurements, newMeasurement()] })}
          >
            <Icon name="plus" />
            Meting toevoegen
          </Button>
          <Button variant="secondary" disabled={!canRemove} onClick={onRemove}>
            <Icon name="trash" />
            Punt verwijderen
          </Button>
        </div>
      )}
    </div>
  )
}
