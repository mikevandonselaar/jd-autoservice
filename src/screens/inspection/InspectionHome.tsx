import { Link } from 'react-router'
import { useEmployee } from '../../auth/AuthProvider'
import { LinkButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'
import { Notice } from '../../components/Notice'
import { PlateBadge } from '../../components/PlateBadge'
import { SectionLabel } from '../../components/SectionLabel'
import { fetchMyDrafts } from '../../inspection/api'
import { formatDayTime } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'

/** On the home screen: start an inspection, or carry on with one that is not completed. */
export function InspectionHome() {
  const employee = useEmployee()
  const { state } = useLoad(() => fetchMyDrafts(employee.user_id))
  const drafts = state.status === 'ready' ? state.data : []

  return (
    <>
      <LinkButton to="/inspectie/nieuw">
        <Icon name="plus" />
        Nieuwe inspectie
      </LinkButton>

      {state.status === 'error' && <Notice>Je lopende inspecties laden lukt nu niet.</Notice>}

      {drafts.length > 0 && (
        <>
          <SectionLabel>Lopende inspecties</SectionLabel>
          <Card className="-mt-2">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                to={`/inspectie/${draft.id}`}
                className="flex min-h-[60px] items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
              >
                <PlateBadge plate={draft.plate} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{draft.checklist_name}</span>
                  <span className="block text-muted">Gestart {formatDayTime(draft.started_at)}</span>
                </span>
                <Icon name="next" className="size-4 text-charcoal" />
              </Link>
            ))}
          </Card>
        </>
      )}
    </>
  )
}
