import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

type ToastType = 'error' | 'success' | 'info';

interface ToastOptions {
  /** A single button on the toast (e.g. Undo). The toast closes when it is clicked. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
  /** A new toast with the same key replaces the one on screen instead of stacking (e.g. repeated Undo offers). */
  replaceKey?: string;
}

interface ToastItem {
  id: number;
  replaceKey?: string;
  message: string;
  type: ToastType;
  action?: ToastOptions['action'];
  durationMs: number;
  /** What had focus when the toast was raised: the control that caused it. */
  trigger: HTMLElement | null;
}

interface ToastCtx {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;
const DISMISS_MS = 4000;

/** Gives focus back to the control that caused a toast, but only when closing it would otherwise drop focus on <body>. */
function restoreFocus(toastEl: HTMLElement | null, trigger: HTMLElement | null) {
  const active = document.activeElement;
  const lost = !active || active === document.body || !!toastEl?.contains(active);
  if (lost && trigger?.isConnected) trigger.focus({ preventScroll: true });
}

/** One toast. Its timer pauses while it is hovered or holds focus, so there is time to reach Undo. */
function ToastView({ toast, onClose }: { toast: ToastItem; onClose: (el: HTMLElement | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.durationMs);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => close.current(el.current), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused]);
  return (
    <div
      ref={el}
      className={`${styles.toast} ${styles[toast.type]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.message}
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action?.onClick();
            onClose(el.current);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((toast: ToastItem, el: HTMLElement | null) => {
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    // After the unmount, so the toast's own button (if it had focus) is already gone when focus is checked.
    queueMicrotask(() => restoreFocus(el, toast.trigger));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'error', options?: ToastOptions) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const toast: ToastItem = {
      id: nextId++,
      message,
      type,
      action: options?.action,
      durationMs: options?.durationMs ?? DISMISS_MS,
      trigger,
      replaceKey: options?.replaceKey,
    };
    const key = options?.replaceKey;
    setToasts((prev) => [...(key ? prev.filter((t) => t.replaceKey !== key) : prev), toast]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className={styles.container} role="status" aria-live="polite">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} onClose={(el) => dismiss(t, el)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
