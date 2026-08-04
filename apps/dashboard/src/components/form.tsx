/**
 * The three pieces every form dialog in the app is built from.
 *
 * Extracted from the topbar's create-flows so the flag dialogs get the same
 * Enter-submits behaviour and the same button semantics without re-deriving
 * them. The subtleties below are each a bug that was fixed once, and each one
 * comes back the moment a dialog hand-rolls its own version.
 */
import { useState, type ReactNode } from 'react';

import { Button } from './ui/button';

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
 * Wrapping the fields in a <form> is what makes Enter submit; without it the
 * only way to create is to reach for the mouse. `noValidate` because the
 * disabled state on the submit button is the validation.
 */
export function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      noValidate
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
 * The submit button carries no onClick: it is `type="submit"`, so the enclosing
 * <Form>'s onSubmit is the single path for both Enter and a click. Handling
 * both would fire the mutation twice per click.
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
   * What the button says while the request is in flight. Defaults to
   * "Creating…" because every dialog that predates the flag form creates
   * something; an edit dialog passes "Saving…", since telling someone you are
   * creating a flag they already have is a small lie that erodes the rest.
   */
  pendingLabel?: string;
  disabled: boolean;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <Button type="submit" disabled={disabled || pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
