import { useAuth } from '../auth/AuthProvider'
import { AdminHome } from './AdminHome'
import { EmployeeHome } from './EmployeeHome'
import { NoAccessPage } from './NoAccessPage'
import { WorkshopHome } from './WorkshopHome'

/** Picks the home screen for the role in the employees table. */
export function HomePage() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.employee) return <NoAccessPage />

  const { employee } = state
  switch (employee.role) {
    case 'admin':
      return <AdminHome employee={employee} />
    case 'workshop':
      return <WorkshopHome employee={employee} />
    case 'employee':
      return <EmployeeHome employee={employee} />
  }
}
