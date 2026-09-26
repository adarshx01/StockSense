import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setTokenGetter, setUnauthorizedHandler } from '../services/api';
import { normalizeUser } from '../services/normalize';
import { authApi } from '../services/resources';
import type { User } from '../types';

const STORAGE_KEY = 'stocksense.session';

interface Session {
  token: string;
  user: User;
}

interface AuthValue {
  token: string | null;
  user: User | null;
  login: (loginId: string, password: string) => Promise<void>;
  signup: (input: { loginId: string; email: string; password: string; fullName?: string }) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const tokenRef = useRef<string | null>(session?.token ?? null);
  tokenRef.current = session?.token ?? null;

  function persist(next: Session | null) {
    tokenRef.current = next?.token ?? null;
    setSession(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sessionStorage can be unavailable */
    }
  }

  useEffect(() => {
    setTokenGetter(() => tokenRef.current);
    setUnauthorizedHandler(() => persist(null));
  }, []);

  const value = useMemo<AuthValue>(() => {
    return {
      token: session?.token ?? null,
      user: session?.user ?? null,
      async login(loginId: string, password: string) {
        const result = await authApi.login(loginId, password);
        persist({ token: result.token, user: normalizeUser(result.user) });
      },
      async signup(input) {
        const result = await authApi.signup(input);
        if (result.token && result.user) {
          persist({ token: result.token, user: normalizeUser(result.user) });
        }
      },
      logout() {
        persist(null);
      },
      setUser(user: User) {
        if (!session) return;
        persist({ token: session.token, user });
      },
    };
    // persist closes over latest session via setState; session is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
