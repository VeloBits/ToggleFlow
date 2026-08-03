/**
 * The create-flows behind the topbar pickers' "＋ Create …" rows.
 *
 * Organisations and projects need one field, so they share `NameDialog`.
 * Environments need two - a display name and an immutable key the SDKs address
 * - which is enough extra behaviour (slug derivation, a stricter validator, a
 * warning about permanence) to earn its own component rather than a third
 * configuration of the first.
 */
import { useState, type ReactNode } from 'react';

import { ErrorNote } from '../ui';
import { Dialog } from '../../ui/dialog';

function useSubmit(onSubmit: () => Promise<void>, onClose: () => void) {
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = () => {
    setPending(true);
    setError(null);
    onSubmit()
      .then(onClose)
      // The dialog stays open on failure so the message has somewhere to go,
      // which means the button has to become live again. On success this runs
      // against an unmounting component and is a no-op.
      .catch(setError)
      .finally(() => setPending(false));
  };
  return { error, pending, submit };
}

/**
 * The submit button carries no onClick: it is `type="submit"`, so the enclosing
 * <Form>'s onSubmit is the single path for both Enter and a click. Handling
 * both would fire the mutation twice per click.
 */
function DialogActions({
  submitLabel,
  disabled,
  pending,
  onClose,
}: {
  submitLabel: string;
  disabled: boolean;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="row">
      <button type="submit" className="primary" disabled={disabled || pending}>
        {pending ? 'Creating…' : submitLabel}
      </button>
      <button type="button" onClick={onClose} disabled={pending}>
        Cancel
      </button>
    </div>
  );
}

/**
 * Wrapping the fields in a <form> is what makes Enter submit; without it the
 * only way to create is to reach for the mouse. `noValidate` because the
 * disabled state below is the validation.
 */
function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
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

export function NameDialog({
  title,
  label,
  placeholder,
  hint,
  submitLabel,
  onCreate,
  onClose,
}: {
  title: string;
  label: string;
  placeholder: string;
  hint?: string;
  submitLabel: string;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const { error, pending, submit } = useSubmit(() => onCreate(trimmed), onClose);

  return (
    <Dialog title={title} onClose={onClose}>
      <Form onSubmit={() => trimmed && !pending && submit()}>
        <div className="field">
          <label htmlFor="scope-name">{label}</label>
          <input
            id="scope-name"
            autoFocus
            value={name}
            placeholder={placeholder}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          {hint && <p className="text-muted m-0 text-[12px]">{hint}</p>}
        </div>
        <ErrorNote error={error} />
        <DialogActions
          submitLabel={submitLabel}
          disabled={!trimmed}
          pending={pending}
          onClose={onClose}
        />
      </Form>
    </Dialog>
  );
}

/** Mirrors the API's environment key rule (routes/projects.ts). */
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** "Load Testing" -> "load-testing". Only used until the user edits the key themselves. */
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

export function CreateEnvironmentDialog({
  onCreate,
  onClose,
}: {
  onCreate: (input: { key: string; name: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  // Once the key has been typed into, it stops tracking the name - otherwise
  // an edit to either field silently discards the other.
  const [keyEdited, setKeyEdited] = useState(false);
  const [key, setKey] = useState('');

  const effectiveKey = keyEdited ? key : slugify(name);
  const keyValid = KEY_PATTERN.test(effectiveKey);
  const { error, pending, submit } = useSubmit(
    () => onCreate({ key: effectiveKey, name: name.trim() }),
    onClose,
  );
  const ready = name.trim().length > 0 && keyValid;

  return (
    <Dialog title="New environment" onClose={onClose}>
      <Form onSubmit={() => ready && !pending && submit()}>
        <div className="field">
          <label htmlFor="env-name">Name</label>
          <input
            id="env-name"
            autoFocus
            value={name}
            placeholder="Staging"
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="env-key">Key</label>
          <input
            id="env-key"
            className="mono"
            value={effectiveKey}
            placeholder="staging"
            maxLength={50}
            aria-invalid={effectiveKey.length > 0 && !keyValid}
            aria-describedby="env-key-hint"
            onChange={(e) => {
              setKeyEdited(true);
              setKey(e.target.value);
            }}
          />
          <p id="env-key-hint" className="text-muted m-0 text-[12px]">
            {effectiveKey.length > 0 && !keyValid
              ? 'Lowercase letters, digits and dashes only, starting with a letter or digit.'
              : 'How SDKs address this environment. It cannot be changed later.'}
          </p>
        </div>
        <ErrorNote error={error} />
        <DialogActions
          submitLabel="Create environment"
          disabled={!ready}
          pending={pending}
          onClose={onClose}
        />
      </Form>
    </Dialog>
  );
}
