import type { Employee } from '../auth/AuthProvider'
import { HomeLayout } from './HomeLayout'

export function AdminHome({ employee }: { employee: Employee }) {
  return <HomeLayout title="Overzicht" employee={employee} />
}
