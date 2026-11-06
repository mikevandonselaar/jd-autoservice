import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AppShell } from '../../components/AppShell'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import { OptionButton } from '../../components/OptionButton'
import { PlateField } from '../../components/PlateBadge'
import { SectionLabel } from '../../components/SectionLabel'
import { fetchChecklists, fetchPreviousVisit, plateKeyOf, startInspection } from '../../inspection/api'
import { termLabel } from '../../inspection/rules'
import type { PreviousVisit } from '../../inspection/types'
import { formatKm } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'

// Same pattern as the database: letters and digits, with dashes between groups.
const PLATE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/
const MAX_KM = 2_000_000

/** M1: licence plate, mileage and the checklist to use. */
export function StartPage() {
  const navigate = useNavigate()
  const checklists = useLoad(fetchChecklists)
  const [plateText, setPlateText] = useState('')
  const [kmText, setKmText] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [found, setFound] = useState<{ key: string; visit: PreviousVisit | null } | null>(null)
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)

  const plate = plateText
  const plateKey = plateKeyOf(plate)
  const plateValid = PLATE.test(plate) && plateKey.length >= 3 && plateKey.length <= 8
  const km = kmText === '' ? null : Number(kmText)

  // Look up the earlier visit once the plate looks complete, not at every key press.
  useEffect(() => {
    if (!plateValid) return
    let active = true
    const timer = setTimeout(() => {
      fetchPreviousVisit(plateKey, null).then(
        (visit) => {
          if (active) setFound({ key: plateKey, visit })
        },
        () => {
          if (active) setFound({ key: plateKey, visit: null })
        },
      )
    }, 400)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [plateKey, plateValid])
  const previous = plateValid && found?.key === plateKey ? found.visit : null
  const earlierAdvice = (previous?.items ?? []).filter((item) => item.status === 'advice')

  const list = checklists.state.status === 'ready' ? checklists.state.data : []
  // With one checklist there is nothing to choose.
  const checklistId = pickedId ?? (list.length === 1 ? list[0].id : null)
  const canStart = plateValid && km !== null && km <= MAX_KM && checklistId !== null && !starting

  async function start() {
    if (!canStart) return
    setStarting(true)
    setFailed(false)
    try {
      const id = await startInspection(checklistId, plate, km)
      navigate(`/inspectie/${id}`, { replace: true })
    } catch {
      setFailed(true)
      setStarting(false)
    }
  }

  return (
    <AppShell
      panel="Inspectie"
      footer={
        <Button disabled={!canStart} onClick={() => void start()}>
          Start inspectie
          <Icon name="next" />
        </Button>
      }
    >
      <h1 className="text-2xl">Nieuwe inspectie</h1>

      <div className="grid grid-cols-[150px_1fr] items-start gap-2.5">
        <PlateField
          id="plate"
          label="Kenteken"
          value={plate}
          maxLength={10}
          onChange={(event) => setPlateText(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="km" className="text-base font-semibold">
            Kilometerstand
          </label>
          <div className="flex h-[60px] items-center gap-1.5 rounded-sm border-[3px] border-charcoal bg-surface px-3">
            <input
              id="km"
              inputMode="numeric"
              autoComplete="off"
              value={kmText === '' ? '' : formatKm(Number(kmText))}
              onChange={(event) => setKmText(event.target.value.replace(/\D/g, '').slice(0, 7).replace(/^0+(?=\d)/, ''))}
              className="w-full min-w-0 flex-1 bg-transparent text-[26px] font-bold text-ink focus:outline-none"
            />
            <span className="font-semibold text-muted">km</span>
          </div>
          {previous && <span className="text-muted">Vorige: {formatKm(previous.odometer_km)} km</span>}
        </div>
      </div>

      {previous && km !== null && km < previous.odometer_km && (
        <Notice tone="advice">Lager dan de vorige keer ({formatKm(previous.odometer_km)} km). Klopt dit?</Notice>
      )}
      {km !== null && km > MAX_KM && <Notice tone="fault">Een kilometerstand boven de 2 miljoen kan niet.</Notice>}

      <div className="flex flex-col gap-2">
        <SectionLabel>Checklist</SectionLabel>
        {checklists.state.status === 'loading' && <Loading />}
        {checklists.state.status === 'error' && <LoadError onRetry={checklists.reload} />}
        {checklists.state.status === 'ready' && list.length === 0 && (
          <Notice>Er is nog geen checklist. De eigenaar maakt die aan bij Beheer.</Notice>
        )}
        <div className="grid grid-cols-2 gap-2">
          {list.map((checklist) => (
            <OptionButton
              key={checklist.id}
              selected={checklist.id === checklistId}
              onClick={() => setPickedId(checklist.id)}
            >
              {checklist.name}
            </OptionButton>
          ))}
        </div>
      </div>

      {earlierAdvice.length > 0 && (
        <Card className="flex flex-col gap-2.5 px-3.5 py-3">
          <SectionLabel>Open advies vorig bezoek</SectionLabel>
          {earlierAdvice.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 border-t border-divider pt-2.5 font-semibold first-of-type:border-t-0 first-of-type:pt-0"
            >
              {item.label}
              <span className="rounded-sm border-2 border-advice bg-advice-tint px-2 py-0.5 font-bold whitespace-nowrap text-advice-ink">
                {item.term ? termLabel[item.term] : ''}
              </span>
            </div>
          ))}
          <span className="text-muted">Deze punten krijgen een markering in de checklist.</span>
        </Card>
      )}

      {failed && <Notice tone="fault">Starten lukt nu niet. Controleer je verbinding en probeer het opnieuw.</Notice>}
    </AppShell>
  )
}
