import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { cn } from './cn';

type ToastVariant = 'success' | 'error';
type PushToast = (message: string, opts?: { variant?: ToastVariant }) => void;

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

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
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) setToasts((current) => current.filter((t) => t.id !== toast.id));
            }}
            className={cn(
              'bg-panel border-border rounded-lg border border-l-4 px-3.5 py-2.5 text-[13px] shadow-md',
              toast.variant === 'success' ? 'border-l-on' : 'border-l-off',
            )}
          >
            <ToastPrimitive.Description>{toast.message}</ToastPrimitive.Description>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-30 flex w-80 flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
