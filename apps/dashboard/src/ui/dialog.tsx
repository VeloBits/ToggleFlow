import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * The first thing a keyboard user should land on in a form dialog.
 *
 * Radix's FocusScope focuses the first tabbable element on mount, which in this
 * layout is the header's ✕ button - so `autoFocus` on a field never won, and
 * opening "New environment" put the caret nowhere while Enter closed the
 * dialog. Redirecting to the first enabled field fixes every form dialog in the
 * app at once; dialogs with no field (the reveal-once key) keep Radix's
 * default.
 */
const FIRST_FIELD =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Modal dialog on Radix (focus trap, Esc, aria wiring, scroll lock) keeping
 * the legacy .modal/.modal-backdrop look. Rendered open; unmount to close
 * (matches how the pages already use Modal).
 */
export function Dialog({
  title,
  onClose,
  children,
  className,
  onOpenAutoFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /**
   * Overrides the first-field focus described above - for a dialog whose field
   * lives outside the content flow, or which wants focus somewhere else
   * entirely (the scope switcher focuses its filter box).
   */
  onOpenAutoFocus?: (event: Event) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Legacy backdrop centered content; Radix overlay/content are siblings, so the content positions itself. */}
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (onOpenAutoFocus) {
              onOpenAutoFocus(event);
              return;
            }
            const field = contentRef.current?.querySelector<HTMLElement>(FIRST_FIELD);
            if (!field) return;
            event.preventDefault();
            field.focus();
          }}
          className={cn(
            'modal fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 outline-none',
            className,
          )}
        >
          <div className="modal-head">
            <DialogPrimitive.Title asChild>
              <h3>{title}</h3>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button type="button" className="ghost" aria-label="Close">
                ✕
              </button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
