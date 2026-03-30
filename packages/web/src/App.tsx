import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.tsx';
import { AppShell } from './components/AppShell.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NetListPage } from './pages/nets/NetListPage.tsx';
import { NetSessionPage } from './pages/nets/NetSessionPage.tsx';
import { NetSummaryPage } from './pages/nets/NetSummaryPage.tsx';
import { TemplateListPage } from './pages/templates/TemplateListPage.tsx';
import { TemplateFormPage } from './pages/templates/TemplateFormPage.tsx';
import { IncidentListPage } from './pages/incidents/IncidentListPage.tsx';
import { IncidentDetailPage } from './pages/incidents/IncidentDetailPage.tsx';
import { OrgPage } from './pages/org/OrgPage.tsx';
import { InviteAcceptPage } from './pages/InviteAcceptPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';

export function App() {
  return (
    <ErrorBoundary section="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route
                  index
                  element={
                    <ErrorBoundary section="Nets">
                      <NetListPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="nets/:id"
                  element={
                    <ErrorBoundary section="Net Session">
                      <NetSessionPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="nets/:id/summary"
                  element={
                    <ErrorBoundary section="Net Summary">
                      <NetSummaryPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="templates"
                  element={
                    <ErrorBoundary section="Templates">
                      <TemplateListPage />
                    </ErrorBoundary>
                  }
                />
                <Route path="templates/new" element={<TemplateFormPage />} />
                <Route path="templates/:id/edit" element={<TemplateFormPage />} />
                <Route
                  path="incidents"
                  element={
                    <ErrorBoundary section="Incidents">
                      <IncidentListPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="incidents/:id"
                  element={
                    <ErrorBoundary section="Incident">
                      <IncidentDetailPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="org"
                  element={
                    <ErrorBoundary section="Organization">
                      <OrgPage />
                    </ErrorBoundary>
                  }
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
