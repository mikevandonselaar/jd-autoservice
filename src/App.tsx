import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { AdminMenuPage } from './screens/admin/AdminMenuPage'
import { ChecklistEditorPage } from './screens/admin/ChecklistEditorPage'
import { ChecklistsPage } from './screens/admin/ChecklistsPage'
import { PartTypesPage } from './screens/admin/PartTypesPage'
import { CallbackPage } from './screens/CallbackPage'
import { HomePage } from './screens/HomePage'
import { ChecklistPage } from './screens/inspection/ChecklistPage'
import { DonePage } from './screens/inspection/DonePage'
import { InspectionLayout } from './screens/inspection/InspectionLayout'
import { OverviewPage } from './screens/inspection/OverviewPage'
import { ReviewPage } from './screens/inspection/ReviewPage'
import { StartPage } from './screens/inspection/StartPage'
import { LoginPage } from './screens/LoginPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />

        {/* The workshop account has no access to inspections. */}
        <Route element={<RequireRole roles={['employee', 'admin']} />}>
          <Route path="/inspecties" element={<OverviewPage />} />
          <Route path="/inspectie/nieuw" element={<StartPage />} />
          <Route path="/inspectie/:id" element={<InspectionLayout />}>
            <Route index element={<ChecklistPage />} />
            <Route path="controle" element={<ReviewPage />} />
            <Route path="klaar" element={<DonePage />} />
          </Route>
        </Route>

        <Route element={<RequireRole roles={['admin']} />}>
          <Route path="/beheer" element={<AdminMenuPage />} />
          <Route path="/beheer/checklists" element={<ChecklistsPage />} />
          <Route path="/beheer/checklists/:id" element={<ChecklistEditorPage />} />
          <Route path="/beheer/onderdelen" element={<PartTypesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
