import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.tsx';
import { AppShell } from './components/AppShell.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NetListPage } from './pages/nets/NetListPage.tsx';
import { NetSessionPage } from './pages/nets/NetSessionPage.tsx';
import { NetSummaryPage } from './pages/nets/NetSummaryPage.tsx';
import { TemplateListPage } from './pages/templates/TemplateListPage.tsx';
import { TemplateFormPage } from './pages/templates/TemplateFormPage.tsx';
import { IncidentListPage } from './pages/incidents/IncidentListPage.tsx';
import { IncidentDetailPage } from './pages/incidents/IncidentDetailPage.tsx';
import { OrgPage } from './pages/org/OrgPage.tsx';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<NetListPage />} />
              <Route
                path="nets/:id"
                element={<NetSessionPage />}
              />
              <Route path="nets/:id/summary" element={<NetSummaryPage />} />
              <Route path="templates" element={<TemplateListPage />} />
              <Route path="templates/new" element={<TemplateFormPage />} />
              <Route path="templates/:id/edit" element={<TemplateFormPage />} />
              <Route path="incidents" element={<IncidentListPage />} />
              <Route path="incidents/:id" element={<IncidentDetailPage />} />
              <Route path="org" element={<OrgPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
