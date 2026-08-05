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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DialogActions, Form, useSubmit } from '@/components/form';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { Dialog } from '@/ui/dialog';
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

  const { Field, labelWiring } = valueControl(form.state.valueType);
  const defaultValueId = 'flag-default-value';

  return (
    <Dialog title={isEdit ? `Edit ${flag?.key}` : 'Create a flag'} onClose={onClose}>
      <Form onSubmit={submit}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flag-name">Name</Label>
            <Input
              id="flag-name"
              value={form.state.name}
              aria-invalid={form.errors.name ? true : undefined}
              onChange={(event) => form.setField('name', event.target.value)}
            />
            {form.errors.name && <FieldError>{form.errors.name}</FieldError>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flag-key">Key</Label>
            <Input
              id="flag-key"
              value={form.effectiveKey}
              // The API has no rename path, and the key is what every deployed
              // SDK call site passes.
              disabled={isEdit}
              className="font-mono text-[12.5px]"
              aria-invalid={form.errors.key ? true : undefined}
              aria-describedby="flag-key-hint"
              onChange={(event) => form.editKey(event.target.value)}
            />
            <p id="flag-key-hint" className="text-muted-foreground m-0 text-[12px]">
              {form.errors.key ? (
                <span className="text-destructive">{form.errors.key}</span>
              ) : isEdit ? (
                'How your SDKs address this flag. It cannot be changed.'
              ) : (
                'How your SDKs address this flag. Derived from the name until you edit it.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flag-description">Description</Label>
            <Textarea
              id="flag-description"
              rows={2}
              value={form.state.description}
              onChange={(event) => form.setField('description', event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flag-type">Type</Label>
            <NativeSelect
              id="flag-type"
              value={form.state.valueType}
              // Enforced by the API too, not only here: changing a type would
              // orphan every stored value, every targeting-rule value and every
              // deployed `getStringValue` call site.
              disabled={isEdit}
              aria-describedby="flag-type-hint"
              onChange={(event) => form.setField('valueType', event.target.value as FlagValueType)}
            >
              {FLAG_VALUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FLAG_TYPES[type].label}
                </option>
              ))}
            </NativeSelect>
            <p id="flag-type-hint" className="text-muted-foreground m-0 text-[12px]">
              {isEdit ? "A flag's type is fixed. Create a new flag to change it." : form.typeHint}
            </p>
          </div>

          {form.state.valueType === 'string_enum' && (
            <EnumOptionsEditor
              options={form.state.enumOptions}
              errors={form.errors}
              onChange={(options) => form.setField('enumOptions', options)}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <Label
              id={fieldLabelId(defaultValueId)}
              // `htmlFor` only where the registry says the field is an element it
              // can bind to. The boolean field is a group, and a `for` pointing at
              // a div is a label that silently does nothing.
              htmlFor={labelWiring === 'htmlFor' ? defaultValueId : undefined}
            >
              Default value
            </Label>
            {/* Rendered through the same registry as the table cell, so a new
                flag type gets its form input and its list rendering from one
                entry rather than two that can disagree. */}
            <Field
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
            <p id="flag-default-hint" className="text-muted-foreground m-0 text-[12px]">
              {form.errors.defaultValue ? (
                <span className="text-destructive">{form.errors.defaultValue}</span>
              ) : form.state.valueType === 'boolean' ? (
                // The API rejects a `defaultValue` on a boolean flag rather than
                // storing one, so "seeded into every environment" is a promise
                // this field cannot keep for this type.
                'A boolean flag stores no value of its own: on is true, off is false, per environment.'
              ) : (
                'Seeded into every environment that does not set its own value.'
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flag-tags">Tags</Label>
            <Input
              id="flag-tags"
              value={form.state.tags}
              placeholder="billing, experiment"
              onChange={(event) => form.setField('tags', event.target.value)}
            />
          </div>

          {/* Create only, and only once an environment is known. Editing a
              definition must not touch per-environment state: that screen is
              reached from the detail page's Settings tab, where State is the tab
              next door and is the one place a live rollout should change. */}
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
          // Never disabled by validity: a disabled submit cannot tell you WHY it
          // is disabled, and this form has cross-field rules ("the default must
          // be one of the options") that are invisible from the button. Submit
          // always fires, `attemptSubmit` reveals the errors in place.
          disabled={false}
          pending={pending}
          onClose={onClose}
        />
      </Form>
    </Dialog>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-destructive m-0 text-[12px]">{children}</p>;
}
