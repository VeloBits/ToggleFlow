/**
 * The three pieces every form dialog in the app is built from.
 *
 * Extracted from the topbar's create-flows so the flag dialogs get the same
 * Enter-submits behaviour and the same button semantics without re-deriving
 * them. The subtleties below are each a bug that was fixed once, and each one
 * comes back the moment a dialog hand-rolls its own version.
 *
 * ## Why this is not `Form` from `@velobits-dev/ui/form`
 *
 * The system's `Form` is `react-hook-form` bound to its `Field` wiring, and it is
 * the right choice for a form built from scratch. The forms here are not: the
 * flag dialog validates through a zod schema with a discriminated union and a
 * `superRefine` (`features/flags/flag-form.ts`), owns its own submitted-gate and
 * slug-latch state, and is covered by a test suite that drives that state
 * directly. Re-hosting it on `react-hook-form` would be a rewrite of validated
 * behaviour for no user-visible gain.
 *
 * What the forms DO take from the system is the per-row a11y wiring — `Field`,
 * `FieldLabel`, `FieldDescription`, `FieldError` — which is where the
 * `aria-describedby` bugs actually live. This file is the surrounding plumbing,
 * deliberately named `DialogForm` so it cannot be mistaken for the system's.
 */
import { Button, DialogClose, DialogFooter, Spinner } from '@velobits-dev/ui';
import { useState, type ReactNode } from 'react';

/**
 * Runs an async submit, holding the pending and error state the dialog needs.
 *
 * The dialog stays open on failure so the message has somewhere to go, which
 * means the button has to become live again. On success `setPending` runs against
 * an unmounting component and is a no-op.
 */
export function useSubmit(onSubmit: () => Promise<void>, onClose: () => void) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = () => {
    setPending(true);
    setError(null);
    onSubmit()
      .then(onClose)
      .catch(setError)
      .finally(() => setPending(false));
  };
  return { error, pending, submit };
}

/**
 * Wrapping the fields in a `<form>` is what makes Enter submit; without it the
 * only way to create is to reach for the mouse. `noValidate` because the disabled
 * state on the submit button is the validation.
 */
export function DialogForm({
  onSubmit,
  children,
  className,
}: {
  onSubmit: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      noValidate
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/**
 * The submit button carries no `onClick`: it is `type="submit"`, so the enclosing
 * `DialogForm`'s `onSubmit` is the single path for both Enter and a click.
 * Handling both would fire the mutation twice per click.
 *
 * `Cancel` is a `DialogClose` rather than an `onClick={onClose}` button, so Radix
 * owns the close and focus returns to whatever opened the dialog. `onClose` is
 * still called — some callers reset state on it — but it is no longer the thing
 * that dismisses.
 */
export function DialogActions({
  submitLabel,
  pendingLabel = 'Creating…',
  disabled,
  pending,
  onClose,
}: {
  submitLabel: string;
  /**
   * What the button says while the request is in flight. Defaults to "Creating…"
   * because every dialog that predates the flag form creates something; an edit
   * dialog passes "Saving…", since telling someone you are creating a flag they
   * already have is a small lie that erodes the rest.
   */
  pendingLabel?: string;
  disabled: boolean;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <DialogFooter className="mt-5">
      <DialogClose asChild>
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </DialogClose>
      {/*
       * `variant="primary"` is explicit: the system's Button defaults to
       * `secondary`, so an unlabelled submit would render as the quieter of the
       * two and the dialog would have no primary action.
       */}
      <Button type="submit" variant="primary" disabled={disabled || pending}>
        {/*
         * `label={null}` makes the spinner `aria-hidden` instead of a
         * `role="status"` announcing "Loading".
         *
         * Two reasons, and the first is a bug: a labelled Spinner is part of the
         * button's accessible NAME, so the control announced as "Loading Saving…"
         * and no `getByRole('button', { name: 'Saving…' })` could find it. The
         * second is that a live region nested inside the control whose own label
         * already changed to "Saving…" announces the same state twice.
         */}
        {pending && <Spinner label={null} />}
        {pending ? pendingLabel : submitLabel}
      </Button>
    </DialogFooter>
  );
}
