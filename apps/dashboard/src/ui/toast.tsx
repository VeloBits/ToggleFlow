import { AlertTriangleIcon, CircleCheckIcon } from '@velobits-dev/icons';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider as ToastRootProvider,
  ToastTitle,
  ToastViewport,
} from '@velobits-dev/ui';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/**
 * The app's toast queue, sitting on the design system's toast primitives.
 *
 * The system ships `Toast` / `ToastProvider` / `ToastViewport` — the
 * presentation and the Radix wiring — but no queue and no hook, because "what
 * counts as a toast" is a product decision. This file is that decision, and it
 * is app composition rather than a leftover primitive: it owns the id counter,
 * the variant vocabulary, and the imperative call shape that 12 sites use.
 *
 * The public API is unchanged from the pre-design-system version, deliberately —
 * `useToast()` still returns the push function itself, so no caller moved:
 *
 * ```ts
 * const toast = useToast();
 * toast('Saved');
 * toast('Could not save', { variant: 'error' });
 * ```
 *
 * ## Three things the system requires that the old version did not do
 *
 * 1. **An icon and a title.** The variant paints an inline-start stripe and
 *    tints the icon, and that is colour — which on its own tells a colour-blind
 *    user nothing (WCAG 1.4.1). So each toast names its state in words as well.
 *    The message becomes the description; the grid already reserves the icon
 *    column, so neither needs laying out here.
 * 2. **A close button.** A message that only leaves on a timer is unusable by
 *    anyone reading slowly (WCAG 2.2.1). Radix pauses the timer on hover and
 *    while focus is inside, and Esc dismisses — `ToastClose` is still required.
 * 3. **The viewport stays out of glass.** `ToastViewport` is `position: fixed`,
 *    and `backdrop-filter` establishes a containing block for fixed descendants,
 *    so a viewport mounted under the glass topbar would anchor to the topbar and
 *    vanish with it. It is rendered here as a SIBLING of `children` — i.e. above
 *    the shell — which is why this provider must stay mounted at the app root.
 *
 * ## `'error'`, not `'danger'`
 *
 * The system's variant for a failure is `danger`, matching its token. This hook
 * keeps saying `error` because that is what every call site passes, and what
 * reads correctly where the code is describing an outcome rather than a colour.
 * The mapping happens once, below.
 */
type ToastVariant = 'success' | 'error';
type PushToast = (message: string, opts?: { variant?: ToastVariant }) => void;

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

/** The state named in words, so the stripe colour is never the only signal. */
const PRESENTATION = {
  success: { variant: 'success', icon: CircleCheckIcon, title: 'Success' },
  error: { variant: 'danger', icon: AlertTriangleIcon, title: 'Error' },
} as const;

/**
 * Defaults to a no-op rather than throwing, so a component rendered in a test
 * without the provider does not fail on a fire-and-forget notification.
 */
const ToastContext = createContext<PushToast>(() => {});

/** `const toast = useToast(); toast('Saved'); toast('Nope', { variant: 'error' });` */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback<PushToast>((message, opts) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant: opts?.variant ?? 'success' }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {/*
       * 4000ms rather than the system's 5000ms default: these are confirmations
       * of an action the user just took, and the queue can stack several during
       * a bulk run. `swipeDirection` is left alone — the system's enter/exit and
       * swipe animations are tuned for its `down` default, and overriding one
       * without the other makes the dismiss gesture fight the animation.
       */}
      <ToastRootProvider duration={4000}>
        {children}
        {toasts.map((toast) => {
          const { variant, icon: ToastIcon, title } = PRESENTATION[toast.variant];
          return (
            <Toast
              key={toast.id}
              variant={variant}
              onOpenChange={(open) => {
                if (!open) setToasts((current) => current.filter((t) => t.id !== toast.id));
              }}
            >
              <ToastIcon />
              <ToastTitle>{title}</ToastTitle>
              <ToastDescription>{toast.message}</ToastDescription>
              <ToastClose />
            </Toast>
          );
        })}
        <ToastViewport />
      </ToastRootProvider>
    </ToastContext.Provider>
  );
}
