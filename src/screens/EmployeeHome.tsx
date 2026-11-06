import type { Employee } from '../auth/AuthProvider'
import { HomeLayout } from './HomeLayout'

export function EmployeeHome({ employee }: { employee: Employee }) {
  return <HomeLayout title="Mijn dag" employee={employee} />
}
