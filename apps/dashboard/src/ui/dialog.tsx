import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ReactNode } from 'react';

import { cn } from './cn';

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
   * Radix focuses the first tabbable element on open, which here is the header
   * close button. A dialog whose point is a text field (the scope switcher)
   * passes this to redirect that initial focus; everything else leaves the
   * default alone.
   */
  onOpenAutoFocus?: (event: Event) => void;
}) {
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
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
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
