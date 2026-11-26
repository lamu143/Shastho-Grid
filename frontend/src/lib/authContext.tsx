"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearStoredSession,
  getStoredAccessToken,
  getStoredSessionUser,
  saveOfflinePinVault,
  setStoredSession,
  verifyOfflinePin,
  type SessionUser,
} from "@/db/dexie";
import { getMe, login as apiLogin } from "@/lib/api";

interface AuthContextValue {
  user: SessionUser | null;
  token: string | null;
  isOfflineSession: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string, pinToVault?: string) => Promise<SessionUser>;
  unlockWithOfflinePin: (email: string, pin: string) => Promise<SessionUser>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateFromStorage = useCallback(() => {
    const storedUser = getStoredSessionUser();
    const storedToken = getStoredAccessToken();
    setUser(storedUser);
    setToken(storedToken);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      hydrateFromStorage();
    }, 0);

    const onAuthUpdated = () => hydrateFromStorage();
    window.addEventListener("awaregrid:auth-updated", onAuthUpdated);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("awaregrid:auth-updated", onAuthUpdated);
    };
  }, [hydrateFromStorage]);

  const signIn = useCallback(
    async (email: string, password: string, pinToVault = "2026") => {
      const res = await apiLogin(email, password);
      setUser(res.user);
      setToken(res.access_token);
      setIsOfflineSession(false);
      await saveOfflinePinVault(res.user, pinToVault, res.access_token);
      return res.user;
    },
    []
  );

  const unlockWithOfflinePin = useCallback(
    async (email: string, pin: string) => {
      const { verified, record } = await verifyOfflinePin(email, pin);
      if (!verified || !record) {
        throw new Error(
          "Invalid offline PIN or no cached clinic vault found for this account."
        );
      }
      const sessionUser: SessionUser = {
        id: record.user_id,
        email: record.email,
        full_name: record.full_name,
        role: record.role,
        clinic_id: record.clinic_id,
        clinic_name: record.clinic_name,
      };
      setStoredSession(record.cached_token, sessionUser);
      setUser(sessionUser);
      setToken(record.cached_token);
      setIsOfflineSession(true);
      return sessionUser;
    },
    []
  );

  const signOut = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setToken(null);
    setIsOfflineSession(false);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getStoredAccessToken()) return;
    try {
      const me = await getMe();
      const activeToken = getStoredAccessToken() ?? "";
      setStoredSession(activeToken, me);
      setUser(me);
      setIsOfflineSession(false);
    } catch {
      // Preserve offline cached user if network unreachable
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isOfflineSession,
      isLoading,
      signIn,
      unlockWithOfflinePin,
      signOut,
      refreshUser,
    }),
    [
      user,
      token,
      isOfflineSession,
      isLoading,
      signIn,
      unlockWithOfflinePin,
      signOut,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
