import type { Employee } from '../auth/AuthProvider'
import { LinkButton } from '../components/Button'
import { Icon } from '../components/icons'
import { HomeLayout } from './HomeLayout'
import { InspectionHome } from './inspection/InspectionHome'

export function AdminHome({ employee }: { employee: Employee }) {
  return (
    <HomeLayout title="Overzicht" employee={employee}>
      <InspectionHome />
      <LinkButton to="/beheer" variant="secondary">
        Beheer
        <Icon name="next" />
      </LinkButton>
    </HomeLayout>
  )
}
