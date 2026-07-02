"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setApiNotifier, type NotifyType } from "./api";

interface Toast {
  id: number;
  message: string;
  type: NotifyType;
}

interface ToastContextValue {
  notify: (message: string, type?: NotifyType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DEFAULT_DURATION_MS)
      );
    },
    [dismiss]
  );

  const notify = useCallback(
    (message: string, type: NotifyType = "error") => {
      setToasts((prev) => {
        // Recurring failures (e.g. a poll hitting a down server every second)
        // shouldn't stack — refresh the existing toast's timer instead.
        const existing = prev.find(
          (toast) => toast.message === message && toast.type === type
        );
        if (existing) {
          scheduleDismiss(existing.id);
          return prev;
        }
        const id = (idRef.current += 1);
        scheduleDismiss(id);
        return [...prev, { id, message, type }];
      });
    },
    [scheduleDismiss]
  );

  // Bridge API-layer failures into toasts for the lifetime of this provider.
  useEffect(() => {
    setApiNotifier((message, type) => notify(message, type));
    return () => setApiNotifier(null);
  }, [notify]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        className="toast-container"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
