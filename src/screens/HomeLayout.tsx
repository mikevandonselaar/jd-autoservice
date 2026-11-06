import type { ReactNode } from 'react'
import { useAuth, type Employee } from '../auth/AuthProvider'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Card, CardRow } from '../components/Card'
import { roleLabel } from '../lib/roles'

type HomeLayoutProps = {
  title: string
  employee: Employee
  /** The actions of this role, above the name and role. */
  children?: ReactNode
}

/** Shared frame of the role homes: name in the header, the actions, name and role in a list, logout. */
export function HomeLayout({ title, employee, children }: HomeLayoutProps) {
  const { signOut } = useAuth()
  return (
    <AppShell
      panel={employee.name}
      footer={
        <Button variant="secondary" onClick={() => void signOut()}>
          Uitloggen
        </Button>
      }
    >
      <h1 className="text-2xl">{title}</h1>
      {children}
      <Card>
        <CardRow label="Naam" value={employee.name} />
        <CardRow label="Rol" value={roleLabel[employee.role]} />
      </Card>
    </AppShell>
  )
}
