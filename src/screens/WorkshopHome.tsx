import type { Employee } from '../auth/AuthProvider'
import { HomeLayout } from './HomeLayout'

export function WorkshopHome({ employee }: { employee: Employee }) {
  return <HomeLayout title="Werkplaats" employee={employee} />
}
