'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRefresh,
  apiRegister,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isApiError,
  saveTokens,
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

  // On mount, try to restore session from stored tokens
  useEffect(() => {
    async function restore() {
      const access = getAccessToken();
      if (access) {
        const me = await apiMe(access);
        if (!isApiError(me)) {
          setState({ user: me, loading: false });
          return;
        }
        // Access token expired — try refresh
        const refresh = getRefreshToken();
        if (refresh) {
          const res = await apiRefresh(refresh);
          if (!isApiError(res)) {
            saveTokens(res.accessToken, res.refreshToken);
            setState({ user: res.user, loading: false });
            return;
          }
        }
        clearTokens();
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
    saveTokens(res.accessToken, res.refreshToken);
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
      saveTokens(res.accessToken, res.refreshToken);
      setState({ user: res.user, loading: false });
      return null;
    },
    [],
  );

  const logout = useCallback(async () => {
    const token = getAccessToken();
    if (token) await apiLogout(token).catch(() => undefined);
    clearTokens();
    setState({ user: null, loading: false });
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    const token = getRefreshToken();
    if (!token) return false;
    const res = await apiRefresh(token);
    if (isApiError(res)) {
      clearTokens();
      setState({ user: null, loading: false });
      return false;
    }
    saveTokens(res.accessToken, res.refreshToken);
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
