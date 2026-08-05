import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactElement, ReactNode } from 'react';

import { cn } from './cn';
import { XIcon } from './icons';

/**
 * Right-anchored side panel (a "sheet") on Radix Dialog - the focus trap, Esc,
 * scroll lock and `role="dialog"` labelling all come from the primitive, exactly
 * as in `dialog.tsx`. Rendered open; unmount to close, which is the contract
 * every caller in this app already uses.
 *
 * ## Why this is not just a wider `Dialog`
 *
 * `Dialog` wears the legacy `.modal` look: a 480px centred card capped at 85vh
 * that scrolls as one block. That is a shape for forms - a handful of fields and
 * two buttons - and it is what every existing caller wants. An audit event's
 * detail is the opposite: a short column of metadata followed by a JSON payload
 * of unbounded length, read *against* the table row it was opened from. Widening
 * the centred card covers that table, and scrolling the card as one block takes
 * the event's identity (who, what, when) off screen the moment you scroll into
 * the payload. Anchoring to the right edge leaves the table in view and gives
 * the payload the full viewport height to scroll inside.
 *
 * ## Why the body is the only scroll container
 *
 * `grid-rows-[auto_1fr_auto]` inside a `fixed inset-y-0` box makes the panel's
 * height definite, so the middle row gets exactly what the header and footer
 * leave it. `overflow-y-auto` there is what makes a 2,000-line payload scroll
 * under a header that stays put. That row also carries `min-h-0`: a grid item's
 * automatic minimum size is its own content, so without the override a row
 * taller than the viewport grows the panel rather than scrolling, and the header
 * and footer slide off the top and bottom of the screen instead. Header and
 * footer sit outside the scroll container, which is why neither needs
 * `position: sticky` to stay put.
 *
 * ## Focus
 *
 * Deliberately no `onOpenAutoFocus` override. `dialog.tsx` redirects focus to
 * the first enabled field because all of its callers are forms; this is a
 * reading surface with no field to land on, so Radix's own default - the first
 * tabbable element, which here is the ✕ - is already the right target.
 */
export function SidePanel({
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}): ReactElement {
  const hasDescription = Boolean(description);
  /*
   * Radix points `aria-describedby` at an id it expects a `Dialog.Description`
   * to claim, and warns in dev when nothing does. With a description we render
   * that part and let the wiring stand; without one the generated attribute has
   * to be explicitly removed - the same `aria-describedby={undefined}` that
   * dialog.tsx passes unconditionally, since it never has a description.
   */
  const describedBy = hasDescription ? {} : { 'aria-describedby': undefined };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-20 bg-[var(--overlay)] duration-200 ease-out" />
        <DialogPrimitive.Content
          {...describedBy}
          className={cn(
            'bg-panel border-border fixed inset-y-0 right-0 z-30 grid h-full w-full grid-rows-[auto_1fr_auto] border-l outline-none sm:max-w-xl',
            'shadow-[-8px_0_32px_rgba(0,0,0,0.14)] dark:shadow-[-8px_0_32px_rgba(0,0,0,0.55)]',
            /*
             * The exit half only plays for a caller that keeps the panel mounted
             * through the transition. With the unmount-to-close contract above,
             * React drops the node before Radix can set data-state="closed" -
             * kept anyway because it costs nothing and is what makes a
             * kept-mounted caller behave the way it looks like it should.
             */
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right',
            'duration-200 ease-out',
            className,
          )}
        >
          <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[15px] font-semibold">
                {title}
              </DialogPrimitive.Title>
              {hasDescription && (
                <DialogPrimitive.Description className="text-muted-foreground mt-0.5 text-[12.5px]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              {/* `border-0 bg-transparent p-0` is required, not tidying: a bare
                  button inherits a bordered box from the components layer. */}
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:bg-highlight hover:text-text focus-visible:ring-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:outline-none"
              >
                <XIcon size={18} />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
