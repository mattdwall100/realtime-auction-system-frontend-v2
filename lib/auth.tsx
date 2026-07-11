"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getMe,
  loginUser,
  logoutUser,
  registerUser,
  type MeResponse,
} from "./api";

// The access token lives in an HttpOnly cookie set by the backend — it is
// never stored in localStorage/sessionStorage and is unreadable from here.
// "Am I logged in?" is answered by asking the server (GET /auth/me): the
// browser attaches the cookie, and a 401 means no valid session.

interface AuthContextValue {
  me: MeResponse | null;
  isAuthenticated: boolean;
  bidderIdentifier: string | null;
  internalUserId: number | null;
  email: string | null;
  isReady: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    bidderIdentifier: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isReady, setIsReady] = useState(false);

  // On load, resolve the session from the cookie. Any failure (401, expired
  // token, server unreachable) is treated as logged out; isReady still flips
  // true so the UI never hangs on "Loading".
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const current = await getMe(false);
        if (!cancelled) setMe(current);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    // The response sets the session cookie and returns the profile.
    setMe(await loginUser({ email, password }));
  }, []);

  const register = useCallback(
    async (email: string, password: string, bidderIdentifier: string) => {
      setMe(await registerUser({ email, password, bidderIdentifier }));
    },
    []
  );

  const logout = useCallback(async () => {
    // Clear local state regardless: even if the server call fails, the user
    // asked to log out and the UI should reflect that.
    try {
      await logoutUser();
    } catch {
      // Cookie may remain until expiry if the server was unreachable.
    }
    setMe(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      isAuthenticated: me !== null,
      bidderIdentifier: me?.bidder_identifier ?? null,
      internalUserId: me?.internal_user_id ?? null,
      email: me?.email ?? null,
      isReady,
      loginWithPassword,
      register,
      logout,
    }),
    [me, isReady, loginWithPassword, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
