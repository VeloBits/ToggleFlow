/**
 * The create-flows behind the topbar pickers' "Create …" rows.
 *
 * Neither dialog sets `autoFocus` on its first field: `DialogContent` is given
 * `focusFirstField`, which is what actually focuses it — Radix's focus scope
 * overrides `autoFocus`, so the attribute would only suggest a mechanism that is
 * not the one at work.
 *
 * Organisations and projects need one field, so they share `NameDialog`.
 * Environments need two — a display name and an immutable key the SDKs address —
 * which is enough extra behaviour (slug derivation, a stricter validator, a
 * warning about permanence) to earn its own component rather than a third
 * configuration of the first.
 *
 * Both are now built from `Field` / `FieldLabel` / `FieldControl` /
 * `FieldDescription`, which assembles `aria-describedby` before the children
 * render. That is the bug the old `.field` markup had: `env-key-hint` swapped its
 * text between a hint and a validation message, so the control's description
 * silently changed meaning while `aria-invalid` flipped underneath it.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
} from '@velobits-dev/ui';
import { useState } from 'react';

import type { CreateEnvironmentInput, CreatedEnvironment, Environment } from '../../api/client';
import { ENVIRONMENT_KEY_PATTERN, slugifyEnvironmentKey } from '../../ui/slug';
import { DialogActions, DialogForm, useSubmit } from '../form';
import { ErrorNote } from '../ui';

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
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent focusFirstField aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogForm onSubmit={() => trimmed && !pending && submit()}>
          <Field id="scope-name">
            <FieldLabel>{label}</FieldLabel>
            <FieldControl>
              <Input
                value={name}
                placeholder={placeholder}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldControl>
            {hint && <FieldDescription>{hint}</FieldDescription>}
          </Field>
          <ErrorNote error={error} />
          <DialogActions
            submitLabel={submitLabel}
            disabled={!trimmed}
            pending={pending}
            onClose={onClose}
          />
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

/** The "start from nothing" option. Not a uuid, so it cannot collide with an id. */
const BLANK = 'blank';

/**
 * The confirmation both callers show after creating an environment.
 *
 * Built from the API's own `copied` list, labels included, so a resource added to
 * the server's inheritance registry appears here with no dashboard change.
 * Zero-count entries are dropped — "copied 0 config values" is noise.
 */
export function environmentCreatedMessage(created: CreatedEnvironment): string {
  if (!created.inheritedFrom) return `Environment “${created.name}” created`;
  const copied = created.copied.filter((resource) => resource.count > 0);
  if (copied.length === 0) {
    return `Environment “${created.name}” created — ${created.inheritedFrom.name} had nothing to copy`;
  }
  const parts = copied.map((resource) => `${resource.count} ${resource.label}`);
  return `Environment “${created.name}” created with ${parts.join(' and ')} from ${created.inheritedFrom.name}`;
}

export function CreateEnvironmentDialog({
  environments,
  defaultInheritFromId,
  onCreate,
  onClose,
}: {
  /** Candidate sources, in the order the environment switcher lists them. */
  environments: Environment[];
  /**
   * Pre-selected source. The caller passes the environment the user is currently
   * in, so the dialog offers to copy the configuration they are looking at — the
   * least surprising default, and the one that makes "duplicate this environment"
   * a two-click operation.
   */
  defaultInheritFromId?: string | null;
  onCreate: (input: CreateEnvironmentInput) => Promise<CreatedEnvironment>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  // Once the key has been typed into, it stops tracking the name — otherwise an
  // edit to either field silently discards the other.
  const [keyEdited, setKeyEdited] = useState(false);
  const [key, setKey] = useState('');
  const [source, setSource] = useState(() => defaultInheritFromId ?? environments[0]?.id ?? BLANK);

  const effectiveKey = keyEdited ? key : slugifyEnvironmentKey(name);
  const keyValid = ENVIRONMENT_KEY_PATTERN.test(effectiveKey);
  const keyError =
    effectiveKey.length > 0 && !keyValid
      ? 'Lowercase letters, digits and dashes only, starting with a letter or digit.'
      : null;
  const inheritFrom = environments.find((e) => e.id === source) ?? null;
  const { error, pending, submit } = useSubmit(
    () =>
      onCreate({
        key: effectiveKey,
        name: name.trim(),
        inheritFromEnvironmentId: inheritFrom?.id ?? null,
      }).then(() => undefined),
    onClose,
  );
  const ready = name.trim().length > 0 && keyValid;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent focusFirstField aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New environment</DialogTitle>
        </DialogHeader>
        <DialogForm onSubmit={() => ready && !pending && submit()} className="flex flex-col gap-4">
          <Field id="env-name">
            <FieldLabel>Name</FieldLabel>
            <FieldControl>
              <Input
                value={name}
                placeholder="Staging"
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldControl>
          </Field>

          {/*
           * The hint and the validation message are now two elements, not one id
           * whose text changes. Both stay in `aria-describedby`, so the rule the
           * key has to satisfy is still announced at the moment it is broken.
           */}
          <Field id="env-key" error={keyError}>
            <FieldLabel>Key</FieldLabel>
            <FieldControl>
              <Input
                className="font-mono"
                value={effectiveKey}
                placeholder="staging"
                maxLength={50}
                onChange={(e) => {
                  setKeyEdited(true);
                  setKey(e.target.value);
                }}
              />
            </FieldControl>
            <FieldError>{keyError}</FieldError>
            <FieldDescription id="env-key-hint">
              How SDKs address this environment. It cannot be changed later.
            </FieldDescription>
          </Field>

          {/*
            A native select rather than the Radix menu the top bar uses: this is a
            field inside a form, where a <select> is what keyboard and
            screen-reader users expect, and it needs no portal inside a dialog.
          */}
          <Field id="env-inherit">
            <FieldLabel>Inherit from</FieldLabel>
            <FieldControl>
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value)}>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name} ({environment.key})
                  </option>
                ))}
                <option value={BLANK}>Blank environment — start with nothing</option>
              </NativeSelect>
            </FieldControl>
            <FieldDescription id="env-inherit-hint">
              {inheritFrom ? (
                <>
                  Copies every flag&apos;s state, rollout, targeting rules and config values from{' '}
                  <strong className="text-fg font-medium">{inheritFrom.name}</strong> as a one-time
                  snapshot. The two environments are independent afterwards, and API keys are never
                  copied. Segments are shared across the project already.
                </>
              ) : (
                <>
                  Every flag starts off with no config. You can still copy an environment later by
                  creating another one.
                </>
              )}
            </FieldDescription>
          </Field>

          <ErrorNote error={error} />
          <DialogActions
            submitLabel="Create environment"
            disabled={!ready}
            pending={pending}
            onClose={onClose}
          />
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
