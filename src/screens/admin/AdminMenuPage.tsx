import { Link } from 'react-router'
import { AppShell, BackHeader } from '../../components/AppShell'
import { Card } from '../../components/Card'
import { Icon } from '../../components/icons'

const entries = [
  { to: '/beheer/checklists', title: 'Checklists', text: 'Welke punten een inspectie heeft' },
  { to: '/beheer/onderdelen', title: 'Types onderdelen', text: 'De redenen die je kiest bij een fout' },
]

export function AdminMenuPage() {
  return (
    <AppShell headerStart={<BackHeader to="/" label="Terug naar het overzicht" title="Beheer" />}>
      <Card>
        {entries.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="flex min-h-16 items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">{entry.title}</span>
              <span className="block text-muted">{entry.text}</span>
            </span>
            <Icon name="next" className="size-4 text-charcoal" />
          </Link>
        ))}
      </Card>
    </AppShell>
  )
}
