export type AppRole = 'employee' | 'admin' | 'workshop'

export const roleLabel: Record<AppRole, string> = {
  employee: 'Monteur',
  admin: 'Eigenaar',
  workshop: 'Werkplaats',
}
