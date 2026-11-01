import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from '@/lib/api';
import { resetSocketAuth } from '@/lib/socket';
import type { Role, User } from '@/lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; role: Role }) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<{ user: User }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  const authenticate = useCallback((token: string, u: User) => {
    tokenStore.set(token);
    setUser(u);
    resetSocketAuth();
    return u;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const d = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
        return authenticate(d.token, d.user);
      },
      register: async (input) => {
        const d = await api<{ token: string; user: User }>('/auth/register', { body: input });
        return authenticate(d.token, d.user);
      },
      logout: () => {
        tokenStore.set(null);
        setUser(null);
        resetSocketAuth();
      },
    }),
    [user, loading, authenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
