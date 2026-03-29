import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface AuthState {
  token: string | null;
  callsign: string | null;
}

interface AuthContextValue extends AuthState {
  login: (callsign: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const TOKEN_KEY = 'emcomm_token';
const CALLSIGN_KEY = 'emcomm_callsign';

function loadStoredAuth(): AuthState {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    callsign: localStorage.getItem(CALLSIGN_KEY),
  };
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
    setAuth({ token: data.token, callsign: data.operator.callsign });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CALLSIGN_KEY);
    setAuth({ token: null, callsign: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...auth, login, logout, isAuthenticated: !!auth.token }}
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
