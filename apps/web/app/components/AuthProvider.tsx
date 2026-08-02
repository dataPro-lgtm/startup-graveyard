'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRefresh,
  apiRegister,
  isApiError,
  type UserProfile,
} from '@/lib/authApi';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
}

interface AuthActions {
  login(email: string, password: string): Promise<string | null>; // null = success, string = error msg
  register(email: string, password: string, displayName?: string): Promise<string | null>;
  logout(): Promise<void>;
  refresh(): Promise<boolean>;
}

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  // Restore the server-managed HttpOnly cookie session without exposing credentials to JavaScript.
  useEffect(() => {
    async function restore() {
      const me = await apiMe();
      if (!isApiError(me)) {
        setState({ user: me, loading: false });
        return;
      }
      const refreshed = await apiRefresh();
      if (!isApiError(refreshed)) {
        setState({ user: refreshed.user, loading: false });
        return;
      }
      setState({ user: null, loading: false });
    }
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await apiLogin(email, password);
    if (isApiError(res)) {
      return res.error === 'invalid_credentials' ? '邮箱或密码错误' : `登录失败：${res.error}`;
    }
    setState({ user: res.user, loading: false });
    return null;
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string): Promise<string | null> => {
      const res = await apiRegister(email, password, displayName);
      if (isApiError(res)) {
        if (res.error === 'email_already_registered') return '该邮箱已注册';
        return `注册失败：${res.error}`;
      }
      setState({ user: res.user, loading: false });
      return null;
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    setState({ user: null, loading: false });
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const res = await apiRefresh();
    if (isApiError(res)) {
      setState({ user: null, loading: false });
      return false;
    }
    setState({ user: res.user, loading: false });
    return true;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
