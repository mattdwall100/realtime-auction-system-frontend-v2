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
  ApiError,
  getMe,
  loginUser,
  registerUser,
  type MeResponse,
} from "./api";

const STORAGE_KEY = "auction_auth";

interface StoredAuth {
  token: string;
  // Optional: on a transient network error at startup we keep a token whose
  // `me` we couldn't re-validate. Every read of `me` must be null-safe.
  me?: MeResponse;
}

function parseStoredToken(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    return typeof parsed.token === "string" && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}

function parseStoredMe(raw: string | null): MeResponse | undefined {
  if (!raw) return undefined;
  try {
    return (JSON.parse(raw) as Partial<StoredAuth>).me;
  } catch {
    return undefined;
  }
}

interface AuthContextValue {
  token: string | null;
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredAuth | null>(null);
  const [isReady, setIsReady] = useState(false);

  const persist = useCallback((next: StoredAuth | null) => {
    setStored(next);
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // On load, restore the token from localStorage and validate it against the
  // backend. A missing, malformed, or rejected (401) token is treated as logged
  // out so the app can redirect to /login instead of getting stuck. A transient
  // network error keeps the stored session optimistically (don't log out on a
  // blip). Either way `isReady` flips true so the UI never hangs on "Loading".
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const token = parseStoredToken(raw);

      if (!token) {
        window.localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) setIsReady(true);
        return;
      }

      try {
        const me = await getMe(token, false);
        if (cancelled) return;
        persist({ token, me });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 0) {
          // Server unreachable — keep the token and let the user retry.
          setStored({ token, me: parseStoredMe(raw) });
        } else {
          // Invalid/expired token (or bad shape) — clear it.
          window.localStorage.removeItem(STORAGE_KEY);
          setStored(null);
        }
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await loginUser({ email, password });
      const me = await getMe(access_token);
      persist({ token: access_token, me });
    },
    [persist]
  );

  const register = useCallback(
    async (email: string, password: string, bidderIdentifier: string) => {
      const { access_token } = await registerUser({
        email,
        password,
        bidderIdentifier,
      });
      const me = await getMe(access_token);
      persist({ token: access_token, me });
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: stored?.token ?? null,
      bidderIdentifier: stored?.me?.bidder_identifier ?? null,
      internalUserId: stored?.me?.internal_user_id ?? null,
      email: stored?.me?.email ?? null,
      isReady,
      loginWithPassword,
      register,
      logout,
    }),
    [stored, isReady, loginWithPassword, register, logout]
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
