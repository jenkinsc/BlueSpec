import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.tsx';
import { AppShell } from './components/AppShell.tsx';
import { ProtectedRoute } from './components/ProtectedRoute.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { PlaceholderPage } from './pages/PlaceholderPage.tsx';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<PlaceholderPage title="Nets" />} />
              <Route
                path="sessions"
                element={<PlaceholderPage title="Live Sessions" />}
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
