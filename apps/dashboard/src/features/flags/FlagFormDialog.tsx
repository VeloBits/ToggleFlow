/**
 * Create and edit a flag definition - one component for both, because the
 * fields are the same and the differences are two `disabled` props and a verb.
 * Two dialogs would drift.
 *
 * Field order follows how people actually think about a new flag: what is it
 * (Name), how will code address it (Key), what does it do (Description), what
 * shape is its value (Type), what values are legal (Options), and what should it
 * be to begin with (Default value). Tags are filing, so they come after the flag
 * is described.
 *
 * The initial rollout comes last, and only when creating. Everything above it is
 * the project-wide definition; it alone acts on one environment, which is the
 * same seam the API draws (`POST /tools` versus a per-environment PATCH) and the
 * same one the detail page draws between its Settings and State tabs. Putting it
 * between the definition fields would blur a distinction this product exists to
 * keep sharp - which environment am I changing?
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { FLAG_TYPES, FLAG_VALUE_TYPES, type FlagValueType } from '@toggleflow/engine';

import { api, type FlagDefinition } from '@/api/client';
import { flagKeys } from '@/api/flags';
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
  Label,
  NativeSelect,
  Textarea,
} from '@velobits-dev/ui';
import { DialogActions, DialogForm, useSubmit } from '@/components/form';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { useToast } from '@/ui/toast';

import type { FlagRow } from './flag-columns';
import { EnumOptionsEditor } from './EnumOptionsEditor';
import { FlagFormRolloutSection } from './FlagFormRolloutSection';
import { isValidRollout } from './RolloutField';
import { fieldLabelId, valueControl } from './value-controls';
import {
  INITIAL_ROLLOUT_OFF,
  toCreateBody,
  toInitialStatePatch,
  toPatchBody,
  useFlagForm,
  type FlagFormState,
} from './flag-form';

function initialStateFor(flag: FlagRow): Partial<FlagFormState> {
  return {
    name: flag.name,
    key: flag.key,
    description: flag.description ?? '',
    tags: flag.tags.join(', '),
    valueType: flag.valueType,
    enumOptions: flag.enumOptions.length > 0 ? flag.enumOptions : [''],
    booleanDefault: flag.defaultValue === true,
    stringDefault: typeof flag.defaultValue === 'string' ? flag.defaultValue : '',
    enumDefault: typeof flag.defaultValue === 'string' ? flag.defaultValue : '',
  };
}

/** What the server's refusal actually said, for a toast that has to carry it. */
const reason = (error: unknown) => (error instanceof Error ? error.message : 'the request failed');

/**
 * The rollout half of the create toast. As concrete as the rest of the app's
 * toasts (`use-flag-mutations` says "rolling out to 25%"): a flag that went live
 * for a quarter of production should say so at the moment it happens, because
 * that line is the first thing anyone looks for afterwards.
 */
function describeInitialState(
  patch: ReturnType<typeof toInitialStatePatch>,
  environmentName: string,
): string {
  if (!patch) return '';
  if (patch.rolloutPercent === null) return ` and turned on in ${environmentName}`;
  return `, rolling out to ${patch.rolloutPercent}% in ${environmentName}`;
}

export function FlagFormDialog({
  mode,
  projectId,
  flag,
  onClose,
}: {
  mode: 'create' | 'edit';
  projectId: string;
  flag?: FlagRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  /*
   * The environment comes from context, not a prop: it is only needed in create
   * mode, both call sites (the list page and the detail page's Settings tab)
   * already live under the provider, and threading it through would make every
   * caller restate what the workspace already knows.
   */
  const ws = useWorkspace();

  const form = useFlagForm({
    mode,
    initial: flag ? initialStateFor(flag) : undefined,
  });
  const [rollout, setRollout] = useState(INITIAL_ROLLOUT_OFF);

  const isEdit = mode === 'edit';
  const environmentName = ws.environment?.name ?? 'this environment';

  /**
   * Both halves of the flag cache. It runs whether or not the state write
   * succeeded, because once the definition POST has returned, the list and the
   * definitions query are stale regardless of what happens after it.
   *
   * `listPrefix` rather than the current environment's key: `POST /tools` seeds a
   * row in every environment of the project, and the one environment we may have
   * just patched is inside the same prefix - so one invalidation covers both
   * writes, and a second, narrower one would only be a second refetch.
   */
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: flagKeys.listPrefix });
    await queryClient.invalidateQueries({ queryKey: flagKeys.definitions(projectId) });
    if (flag) await queryClient.invalidateQueries({ queryKey: flagKeys.detail(flag.id) });
  };

  const { error, pending, submit } = useSubmit(async () => {
    const values = form.attemptSubmit();
    /*
     * Rejected rather than returned: `useSubmit` closes the dialog when this
     * promise RESOLVES, so returning quietly threw the whole form away and left
     * the field errors on a dialog that was no longer there.
     */
    if (!values) throw new Error('Some fields need attention.');

    if (isEdit) {
      await api.patch(`/v1/tools/${flag!.id}`, toPatchBody(values));
      await invalidate();
      toast(`${values.key} updated`);
      return;
    }

    const statePatch = toInitialStatePatch(rollout);
    /*
     * Checked before anything is written, the way the API's bulk route validates
     * a whole manifest before its first insert. The number field clamps to
     * 0-100 but cannot stop "1.5", and learning that from the second request
     * would turn a typo into the partial state described below.
     */
    if (statePatch && !isValidRollout(statePatch.rolloutPercent)) {
      throw new Error('A rollout percentage must be a whole number from 0 to 100.');
    }

    const created = await api.post<FlagDefinition>(
      `/v1/projects/${projectId}/tools`,
      toCreateBody(values),
    );

    /*
     * Two writes in a forced order: the definition has to exist before any
     * environment can be addressed, because the PATCH's URL needs its id and the
     * `flag_states` rows it edits are the ones the POST seeds. There is no
     * create-with-state endpoint and no transaction spanning the two, so
     * "created, not rolled out" is a state a user can really land in.
     *
     * It is reported rather than hidden or undone. Rejecting would hold open a
     * dialog whose only remaining outcome is a 409 on the key it just took;
     * deleting the flag to roll back would destroy something the user asked for,
     * need a permission they may not have, and erase the audit trail of the
     * attempt. So the flag stays, the caches refresh, the dialog closes on a flag
     * that really was created, and one error toast says what did not happen and
     * where to finish it.
     */
    let rolloutError: unknown = null;
    if (statePatch) {
      try {
        // Non-null: `enabled` can only have been set from a section that renders
        // once the workspace has an environment.
        await api.patch(
          `/v1/environments/${ws.environmentId!}/tools/${created.id}/flag`,
          statePatch,
        );
      } catch (cause) {
        rolloutError = cause;
      }
    }

    await invalidate();

    if (rolloutError) {
      toast(
        `${values.key} created, but its rollout in ${environmentName} was not applied: ${reason(rolloutError)}. Set it on the flag's State tab.`,
        { variant: 'error' },
      );
      return;
    }
    toast(`${values.key} created${describeInitialState(statePatch, environmentName)}`);
  }, onClose);

  /*
   * Aliased: `Field` is also the system's form-row wrapper, imported above. The
   * registry's is the *control* for a flag's type, not a row.
   */
  const { Field: ValueField, labelWiring } = valueControl(form.state.valueType);
  const defaultValueId = 'flag-default-value';

  return (
    /*
     * `open` is a constant because both call sites mount and unmount this
     * component - the dialog's whole state, including the form, is meant to be
     * thrown away on close. `onOpenChange` is still wired, because it is what
     * Escape, the ✕ and an outside click go through.
     */
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* `focusFirstField` replaces the deleted local dialog's focus redirect:
          Radix's FocusScope lands on the header ✕ otherwise, and `autoFocus` on
          a field has never won against it. `aria-describedby={undefined}`
          because there is no DialogDescription to claim the reference. */}
      <DialogContent size="md" focusFirstField aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${flag?.key}` : 'Create a flag'}</DialogTitle>
        </DialogHeader>
        <DialogForm onSubmit={submit}>
          <div className="flex flex-col gap-3">
            {/* Every row below is the system's `Field`, so the id, the
                `aria-describedby` and the `aria-invalid` are wired by it rather
                than spelled out per field - which is exactly where this form's
                aria bugs used to live. `describedBy={false}` on the rows that
                render no description, so nothing points at an id that is not
                there. */}
            <Field id="flag-name" error={form.errors.name} describedBy={false}>
              <FieldLabel>Name</FieldLabel>
              <FieldControl>
                <Input
                  value={form.state.name}
                  onChange={(event) => form.setField('name', event.target.value)}
                />
              </FieldControl>
              <FieldError>{form.errors.name}</FieldError>
            </Field>

            <Field id="flag-key" error={form.errors.key}>
              <FieldLabel>Key</FieldLabel>
              <FieldControl>
                <Input
                  value={form.effectiveKey}
                  // The API has no rename path, and the key is what every
                  // deployed SDK call site passes.
                  disabled={isEdit}
                  className="font-mono text-[12.5px]"
                  onChange={(event) => form.editKey(event.target.value)}
                />
              </FieldControl>
              {/*
               * The rule and the violation, not one replacing the other: the
               * description says what a key may contain, and it is still worth
               * reading while the error explains which part was broken.
               */}
              <FieldDescription>
                {isEdit
                  ? 'How your SDKs address this flag. It cannot be changed.'
                  : 'How your SDKs address this flag. Derived from the name until you edit it.'}
              </FieldDescription>
              <FieldError>{form.errors.key}</FieldError>
            </Field>

            <Field id="flag-description" describedBy={false}>
              <FieldLabel>Description</FieldLabel>
              <FieldControl>
                <Textarea
                  rows={2}
                  value={form.state.description}
                  onChange={(event) => form.setField('description', event.target.value)}
                />
              </FieldControl>
            </Field>

            <Field id="flag-type">
              <FieldLabel>Type</FieldLabel>
              <FieldControl>
                <NativeSelect
                  value={form.state.valueType}
                  // Enforced by the API too, not only here: changing a type
                  // would orphan every stored value, every targeting-rule value
                  // and every deployed `getStringValue` call site.
                  disabled={isEdit}
                  onChange={(event) =>
                    form.setField('valueType', event.target.value as FlagValueType)
                  }
                >
                  {FLAG_VALUE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {FLAG_TYPES[type].label}
                    </option>
                  ))}
                </NativeSelect>
              </FieldControl>
              <FieldDescription>
                {isEdit ? "A flag's type is fixed. Create a new flag to change it." : form.typeHint}
              </FieldDescription>
            </Field>

            {form.state.valueType === 'string_enum' && (
              <EnumOptionsEditor
                options={form.state.enumOptions}
                errors={form.errors}
                onChange={(options) => form.setField('enumOptions', options)}
              />
            )}

            {/*
             * The one row that is NOT a system `Field`, and deliberately so.
             * `FieldLabel` always emits `htmlFor`, and the registry decides per
             * type whether the control is something `htmlFor` can bind to: the
             * boolean field's root is a radiogroup `div`, where a `for` dangles
             * silently - no accessible name, and clicking the label does
             * nothing. So the label wiring stays inverted here, driven by
             * `labelWiring`, which is the whole reason that field exists.
             */}
            <div className="flex flex-col gap-1.5">
              <Label
                id={fieldLabelId(defaultValueId)}
                htmlFor={labelWiring === 'htmlFor' ? defaultValueId : undefined}
              >
                Default value
              </Label>
              {/* Rendered through the same registry as the table cell, so a new
                  flag type gets its form input and its list rendering from one
                  entry rather than two that can disagree. */}
              <ValueField
                id={defaultValueId}
                value={
                  form.state.valueType === 'boolean'
                    ? form.state.booleanDefault
                    : form.state.valueType === 'string'
                      ? form.state.stringDefault
                      : form.state.enumDefault
                }
                constraints={{ enumOptions: form.state.enumOptions.filter(Boolean) }}
                invalid={form.errors.defaultValue ? true : undefined}
                describedBy="flag-default-hint"
                onChange={(value) => {
                  if (form.state.valueType === 'boolean')
                    form.setField('booleanDefault', value === true);
                  else if (form.state.valueType === 'string')
                    form.setField('stringDefault', String(value));
                  else form.setField('enumDefault', String(value));
                }}
              />
              <p id="flag-default-hint" className="text-muted-foreground m-0 text-xs">
                {form.errors.defaultValue ? (
                  <span className="text-danger">{form.errors.defaultValue}</span>
                ) : form.state.valueType === 'boolean' ? (
                  // The API rejects a `defaultValue` on a boolean flag rather
                  // than storing one, so "seeded into every environment" is a
                  // promise this field cannot keep for this type.
                  'A boolean flag stores no value of its own: on is true, off is false, per environment.'
                ) : (
                  'Seeded into every environment that does not set its own value.'
                )}
              </p>
            </div>

            <Field id="flag-tags" describedBy={false}>
              <FieldLabel>Tags</FieldLabel>
              <FieldControl>
                <Input
                  value={form.state.tags}
                  placeholder="billing, experiment"
                  onChange={(event) => form.setField('tags', event.target.value)}
                />
              </FieldControl>
            </Field>

            {/* Create only, and only once an environment is known. Editing a
                definition must not touch per-environment state: that screen is
                reached from the detail page's Settings tab, where State is the
                tab next door and is the one place a live rollout should change. */}
            {!isEdit && ws.environment && (
              <FlagFormRolloutSection
                environmentName={ws.environment.name}
                value={rollout}
                onChange={setRollout}
              />
            )}
          </div>

          <ErrorNote error={error} />
          <DialogActions
            submitLabel={isEdit ? 'Save changes' : 'Create flag'}
            pendingLabel={isEdit ? 'Saving…' : 'Creating…'}
            // Never disabled by validity: a disabled submit cannot tell you WHY
            // it is disabled, and this form has cross-field rules ("the default
            // must be one of the options") that are invisible from the button.
            // Submit always fires, `attemptSubmit` reveals the errors in place.
            disabled={false}
            pending={pending}
            onClose={onClose}
          />
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
