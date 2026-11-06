import { Navigate } from 'react-router'
import { useEmployee } from '../../auth/AuthProvider'
import { AppShell } from '../../components/AppShell'
import { LinkButton } from '../../components/Button'
import { Card, CardRow } from '../../components/Card'
import { Icon } from '../../components/icons'
import { PlateBadge } from '../../components/PlateBadge'
import { SectionLabel } from '../../components/SectionLabel'
import { useInspection } from '../../inspection/InspectionContext'
import { priorAdvice, termLabel } from '../../inspection/rules'
import { formatDayTime, formatKm } from '../../lib/format'

/** M6: what the front desk needs to know, and the way to the next car. */
export function DonePage() {
  const employee = useEmployee()
  const { inspection, items, previousByPoint } = useInspection()

  if (inspection.status === 'draft') return <Navigate to={`/inspectie/${inspection.id}`} replace />

  const advice = items.filter((item) => item.status === 'advice')
  const faults = items.filter((item) => item.status === 'fault')
  const repeats = [...advice, ...faults].filter((item) => priorAdvice(previousByPoint, item)).length

  return (
    <AppShell
      panel={employee.name}
      footer={
        <LinkButton to="/inspectie/nieuw">
          Volgende auto
          <Icon name="next" />
        </LinkButton>
      }
    >
      <div className="flex flex-col items-center gap-2.5 pt-3.5 text-center">
        <span className="flex size-[72px] items-center justify-center rounded-full bg-good text-white">
          <Icon name="check" className="size-10" />
        </span>
        <h1 className="mt-1 text-2xl">Inspectie opgeslagen</h1>
        <PlateBadge plate={inspection.plate} size="md" />
        <span className="text-muted">
          {formatKm(inspection.odometer_km)} km
          {inspection.completed_at && ` · ${formatDayTime(inspection.completed_at)}`}
        </span>
      </div>

      <SectionLabel>Naar de balie</SectionLabel>
      <Card className="-mt-2">
        <CardRow label="Adviespunten" value={String(advice.length)} />
        <CardRow label="Fout, klant bellen" value={String(faults.length)} />
        <CardRow label="Herhaling van vorig bezoek" value={String(repeats)} />
      </Card>
      {inspection.note && (
        <Card className="px-3.5 py-3">
          <p className="mb-1 font-semibold text-muted">Notitie</p>
          <p className="whitespace-pre-wrap">{inspection.note}</p>
        </Card>
      )}

      {advice.length > 0 && (
        <>
          <SectionLabel>Verwacht bij volgend bezoek</SectionLabel>
          <Card className="-mt-2">
            {advice.map((item) => (
              <div
                key={item.id}
                className="flex min-h-12 items-center justify-between gap-2.5 border-b border-divider px-3.5 py-1.5 last:border-b-0"
              >
                <span>{item.label}</span>
                <span className="rounded-sm border-2 border-advice bg-advice-tint px-2 py-0.5 font-bold whitespace-nowrap text-advice-ink">
                  {item.term ? termLabel[item.term] : ''}
                </span>
              </div>
            ))}
          </Card>
          <p className="-mt-2 text-muted">Bij het volgende bezoek krijgen deze punten een markering in de checklist.</p>
        </>
      )}
    </AppShell>
  )
}
