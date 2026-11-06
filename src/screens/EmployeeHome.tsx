import type { Employee } from '../auth/AuthProvider'
import { HomeLayout } from './HomeLayout'
import { InspectionHome } from './inspection/InspectionHome'

export function EmployeeHome({ employee }: { employee: Employee }) {
  return (
    <HomeLayout title="Mijn dag" employee={employee}>
      <InspectionHome />
    </HomeLayout>
  )
}
