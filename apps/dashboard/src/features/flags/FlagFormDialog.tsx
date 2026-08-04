/**
 * Create and edit a flag definition - one component for both, because the
 * fields are the same and the differences are two `disabled` props and a verb.
 * Two dialogs would drift.
 *
 * Field order follows how people actually think about a new flag: what is it
 * (Name), how will code address it (Key), what does it do (Description), what
 * shape is its value (Type), what values are legal (Options), and what should it
 * be to begin with (Default value).
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
import { Dialog } from '@/ui/dialog';
import { useToast } from '@/ui/toast';

import type { FlagRow } from './flag-columns';
import { EnumOptionsEditor } from './EnumOptionsEditor';
import { valueControl } from './value-controls';
import { toCreateBody, toPatchBody, useFlagForm, type FlagFormState } from './flag-form';

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
  const [serverError, setServerError] = useState<unknown>(null);

  const form = useFlagForm({
    mode,
    initial: flag ? initialStateFor(flag) : undefined,
  });

  const { error, pending, submit } = useSubmit(async () => {
    const values = form.attemptSubmit();
    if (!values) return;
    setServerError(null);
    if (mode === 'create') {
      await api.post<FlagDefinition>(`/v1/projects/${projectId}/tools`, toCreateBody(values));
      toast(`${values.key} created`);
    } else {
      await api.patch(`/v1/tools/${flag!.id}`, toPatchBody(values));
      toast(`${values.key} updated`);
    }
    await queryClient.invalidateQueries({ queryKey: ['flags'] });
    await queryClient.invalidateQueries({ queryKey: flagKeys.definitions(projectId) });
    if (flag) await queryClient.invalidateQueries({ queryKey: flagKeys.detail(flag.id) });
  }, onClose);

  const isEdit = mode === 'edit';
  const { Field } = valueControl(form.state.valueType);
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
            <Label htmlFor={defaultValueId}>Default value</Label>
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
        </div>

        <ErrorNote error={error ?? serverError} />
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
