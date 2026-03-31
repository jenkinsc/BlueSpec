import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  token: string | null;
  callsign: string | null;
  orgId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (callsign: string, password: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  register: (callsign: string, name: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const TOKEN_KEY = 'emcomm_token';
const CALLSIGN_KEY = 'emcomm_callsign';
export const ORG_KEY = 'emcomm_org';

function loadStoredAuth(): AuthState {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    callsign: localStorage.getItem(CALLSIGN_KEY),
    orgId: localStorage.getItem(ORG_KEY),
  };
}

async function fetchAndStoreOrg(token: string): Promise<string | null> {
  try {
    const res = await fetch('/api/organizations', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const orgs = (await res.json()) as Array<{ id: string }>;
    if (orgs.length === 0) return null;
    const orgId = orgs[0].id;
    localStorage.setItem(ORG_KEY, orgId);
    return orgId;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadStoredAuth);

  const login = useCallback(async (callsign: string, password: string) => {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'Login failed');
    }
    const data = (await res.json()) as { token: string; operator: { callsign: string } };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(CALLSIGN_KEY, data.operator.callsign);
    const orgId = await fetchAndStoreOrg(data.token);
    setAuth({ token: data.token, callsign: data.operator.callsign, orgId });
  }, []);

  const loginDemo = useCallback(async () => {
    const res = await fetch('/auth/demo', { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'Demo login failed');
    }
    const data = (await res.json()) as { token: string; operator: { callsign: string } };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(CALLSIGN_KEY, data.operator.callsign);
    const orgId = await fetchAndStoreOrg(data.token);
    setAuth({ token: data.token, callsign: data.operator.callsign, orgId });
  }, []);

  const register = useCallback(
    async (callsign: string, name: string, password: string, email?: string) => {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callsign, name, password, ...(email ? { email } : {}) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Registration failed');
      }
      const data = (await res.json()) as { token: string; operator: { callsign: string } };
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(CALLSIGN_KEY, data.operator.callsign);
      const orgId = await fetchAndStoreOrg(data.token);
      setAuth({ token: data.token, callsign: data.operator.callsign, orgId });
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CALLSIGN_KEY);
    localStorage.removeItem(ORG_KEY);
    setAuth({ token: null, callsign: null, orgId: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...auth, login, loginDemo, register, logout, isAuthenticated: !!auth.token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
