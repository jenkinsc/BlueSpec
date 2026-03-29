import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.tsx';
import { AppShell } from './components/AppShell.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { PlaceholderPage } from './pages/PlaceholderPage.tsx';
import { NetListPage } from './pages/nets/NetListPage.tsx';

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
                element={<PlaceholderPage title="Live Net Session" />}
              />
              <Route
                path="nets/:id/summary"
                element={<PlaceholderPage title="Net Summary" />}
              />
              <Route
                path="templates"
                element={<PlaceholderPage title="Net Templates" />}
              />
              <Route
                path="incidents"
                element={<PlaceholderPage title="Incidents" />}
              />
              <Route
                path="org"
                element={<PlaceholderPage title="Organization" />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
