import { useState } from 'react'
import { Link } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FindingBadge } from '../../components/FindingBadge'
import { Icon } from '../../components/icons'
import { LoadError, Loading } from '../../components/LoadState'
import { Notice } from '../../components/Notice'
import { PhotoThumb } from '../../components/PhotoThumb'
import { PhotoViewer } from '../../components/PhotoViewer'
import { PlateBadge } from '../../components/PlateBadge'
import { fetchCompleted, type CompletedInspection } from '../../inspection/api'
import { usePhotoUrls } from '../../inspection/photos'

type Finding = CompletedInspection['findings'][number]
import { formatDayName, formatKm, formatTime } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'

const FIRST_DAYS = 7
const MORE_DAYS = 7

/** The completed inspections grouped by day, as a front desk wants them: what needs a call. */
function groupByDay(inspections: CompletedInspection[]): { label: string; inspections: CompletedInspection[] }[] {
  const groups = new Map<string, { label: string; inspections: CompletedInspection[] }>()
  for (const inspection of inspections) {
    // The sv-SE locale writes 2026-11-06, which is a day key that sorts the same way as the days.
    const key = new Date(inspection.completed_at).toLocaleDateString('sv-SE')
    const group = groups.get(key) ?? { label: formatDayName(inspection.completed_at), inspections: [] }
    group.inspections.push(inspection)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** Completed inspections per day, with the faults and advice found. For the front desk. */
export function OverviewPage() {
  const [days, setDays] = useState(FIRST_DAYS)
  const [onlyFindings, setOnlyFindings] = useState(false)
  const { state, reload } = useLoad(() => fetchCompleted(days))

  function showMore() {
    setDays(days + MORE_DAYS)
    reload(true)
  }

  const all = state.status === 'ready' ? state.data : []
  const shown = onlyFindings ? all.filter((inspection) => inspection.findings.length > 0) : all
  const urlOf = usePhotoUrls(shown.flatMap((inspection) => inspection.findings.flatMap((finding) => finding.photos.map((photo) => photo.path))))
  // The photos of a completed inspection can be looked at, not changed.
  const [viewing, setViewing] = useState<{ finding: Finding; index: number } | null>(null)

  return (
    <AppShell headerStart={<BackHeader to="/" label="Terug naar het overzicht" title="Afgerond" />}>
      <button
        type="button"
        aria-pressed={onlyFindings}
        onClick={() => setOnlyFindings(!onlyFindings)}
        className="inline-flex min-h-14 cursor-pointer items-center gap-2 self-start rounded-sm border-2 border-charcoal bg-surface px-3 font-bold text-charcoal"
      >
        <span
          className={`flex size-5 items-center justify-center rounded-sm border-2 border-charcoal ${onlyFindings ? 'bg-charcoal text-white' : ''}`}
        >
          {onlyFindings && <Icon name="check" className="size-3" />}
        </span>
        Alleen met fout of advies
      </button>

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={reload} />}
      {state.status === 'ready' && shown.length === 0 && (
        <Notice>
          {onlyFindings ? 'Geen fouten of adviezen' : 'Geen afgeronde inspecties'} in de laatste {days} dagen.
        </Notice>
      )}

      {groupByDay(shown).map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base tracking-[0.08em]">{group.label}</h2>
            <span className="text-muted">
              {group.inspections.length} {group.inspections.length === 1 ? 'inspectie' : 'inspecties'}
            </span>
          </div>
          {group.inspections.map((inspection) => (
            <Card key={inspection.id}>
              <Link
                to={`/inspectie/${inspection.id}/klaar`}
                className="flex min-h-14 items-center gap-3 px-3.5 py-2"
              >
                <PlateBadge plate={inspection.plate} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{formatTime(inspection.completed_at)}</span>
                  <span className="block truncate text-muted">
                    {inspection.checklist_name} · {formatKm(inspection.odometer_km)} km
                  </span>
                </span>
                <Icon name="next" className="size-4 text-charcoal" />
              </Link>
              {inspection.findings.length === 0 ? (
                <p className="border-t border-divider px-3.5 py-2 text-muted">Geen bijzonderheden</p>
              ) : (
                <ul className="border-t border-divider">
                  {inspection.findings.map((finding) => (
                    <li
                      key={`${finding.block_sort}-${finding.sort}`}
                      className="flex items-start gap-2.5 border-b border-divider px-3.5 py-2 last:border-b-0"
                    >
                      <FindingBadge status={finding.status} term={finding.term} className="w-[104px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{finding.label}</span>
                        {finding.reason && <span className="block text-muted">{finding.reason}</span>}
                        {finding.photos.length > 0 && (
                          <span className="mt-1.5 flex gap-1.5">
                            {finding.photos.map((photo, index) => (
                              <PhotoThumb
                                key={photo.id}
                                url={urlOf(photo.path)}
                                label={`Foto ${index + 1} van ${finding.label.toLowerCase()} bekijken`}
                                onClick={() => setViewing({ finding, index })}
                                className="h-14 w-[72px]"
                              />
                            ))}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {inspection.note && (
                <p className="border-t border-divider px-3.5 py-2 whitespace-pre-wrap">
                  <span className="font-semibold text-muted">Notitie: </span>
                  {inspection.note}
                </p>
              )}
            </Card>
          ))}
        </section>
      ))}

      {state.status === 'ready' && (
        <Button variant="secondary" onClick={showMore}>
          Eerdere dagen laden
        </Button>
      )}

      {viewing && (
        <PhotoViewer
          title={viewing.finding.label}
          eyebrow={viewing.finding.block_name}
          photos={viewing.finding.photos}
          start={viewing.index}
          onClose={() => setViewing(null)}
        />
      )}
    </AppShell>
  )
}
