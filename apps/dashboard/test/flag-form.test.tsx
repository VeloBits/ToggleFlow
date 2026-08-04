// @vitest-environment happy-dom
/**
 * The create/edit flag dialog: the key latch, per-type fields, the enum options
 * editor, cross-field validation, and the two request bodies.
 *
 * Driven through the dialog rather than by calling `useFlagForm` directly,
 * because the interesting behaviour is the wiring - which field opens the latch,
 * which fields a type shows, what actually gets POSTed.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagFormDialog } from '../src/features/flags/FlagFormDialog';
import type { FlagRow } from '../src/features/flags/flag-columns';
import {
  PROJECT_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const CREATE = `POST /v1/projects/${PROJECT_ID}/tools`;

const existing = (over: Partial<FlagRow> = {}): FlagRow => ({
  id: 't1',
  key: 'tool.summarize',
  name: 'Summarize',
  archived: false,
  enabled: true,
  rolloutPercent: null,
  targetingRules: [],
  valueType: 'boolean',
  enumOptions: [],
  value: null,
  defaultValue: null,
  updatedAt: '2026-07-20T10:00:00.000Z',
  tags: ['text'],
  description: 'Condense long text',
  ...over,
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof FlagFormDialog>> = {},
  handlers: Handlers = {},
): { stub: FetchStub; onClose: () => void } {
  stubAuth();
  const stub = stubFetch({
    ...workspaceHandlers('admin'),
    [CREATE]: { id: 'new', key: 'x' },
    'PATCH /v1/tools/t1': {},
    ...handlers,
  });
  const onClose = vi.fn();
  renderWithProviders(
    <FlagFormDialog mode="create" projectId={PROJECT_ID} onClose={onClose} {...props} />,
    { withWorkspace: false },
  );
  return { stub, onClose };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (value: string) => fireEvent.change(field('Type'), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create flag' }));
const body = (stub: FetchStub, key = CREATE) => stub.calls.find((call) => call.key === key)?.body;

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the key latch', () => {
  it('derives the key from the name until the key is edited', () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Rollout Banner Copy' } });
    expect(field('Key').value).toBe('rollout-banner-copy');

    fireEvent.change(field('Name'), { target: { value: 'Rollout Banner' } });
    expect(field('Key').value).toBe('rollout-banner');
  });

  it('stops following the name once the key is typed in, and never resumes', () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Banner' } });
    fireEvent.change(field('Key'), { target: { value: 'banner.copy' } });
    expect(field('Key').value).toBe('banner.copy');

    fireEvent.change(field('Name'), { target: { value: 'Something Else Entirely' } });
    expect(field('Key').value).toBe('banner.copy');

    // A latch, not a comparison: clearing the key does not hand control back.
    fireEvent.change(field('Key'), { target: { value: '' } });
    fireEvent.change(field('Name'), { target: { value: 'Another Name' } });
    expect(field('Key').value).toBe('');
  });

  it('keeps dots that the API allows in a flag key', () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'checkout.v2' } });
    expect(field('Key').value).toBe('checkout.v2');
  });

  it('rejects a key the API would reject, naming the rule', async () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Valid Name' } });
    fireEvent.change(field('Key'), { target: { value: 'Not A Key!' } });
    submit();
    await waitFor(() =>
      expect(screen.getByText(/Lowercase letters, digits, dots, dashes/)).toBeTruthy(),
    );
  });

  it('requires a name', async () => {
    renderDialog();
    fireEvent.change(field('Key'), { target: { value: 'a.key' } });
    submit();
    await waitFor(() => expect(screen.getByText('Name is required')).toBeTruthy());
  });

  it('says nothing until a submit is attempted', () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: '' } });
    // Typing a name should not scold; errors are a response to submitting.
    expect(screen.queryByText('Name is required')).toBeNull();
  });
});

describe('type-specific fields', () => {
  it('shows the options editor only for a choice flag', () => {
    renderDialog();
    expect(screen.queryByLabelText('Option 1')).toBeNull();
    type('string_enum');
    expect(screen.getByLabelText('Option 1')).toBeTruthy();
    type('string');
    expect(screen.queryByLabelText('Option 1')).toBeNull();
  });

  it('renders the default value control the type calls for', () => {
    renderDialog();
    // Boolean: a switch, because for a boolean flag the switch IS the value.
    expect(field('Default value').getAttribute('role')).toBe('switch');
    type('string');
    expect(field('Default value').tagName).toBe('INPUT');
    type('string_enum');
    expect(field('Default value').tagName).toBe('SELECT');
  });

  it('explains each type as it is chosen', () => {
    renderDialog();
    expect(screen.getByText(/On or off/)).toBeTruthy();
    type('string_enum');
    expect(screen.getByText(/limited to a fixed set/)).toBeTruthy();
  });

  it('remembers a per-type default across a type change', () => {
    renderDialog();
    type('string');
    fireEvent.change(field('Default value'), { target: { value: 'hello' } });
    type('boolean');
    type('string');
    // Switching type and back should not silently discard what was typed.
    expect(field('Default value').value).toBe('hello');
  });
});

describe('the enum options editor', () => {
  const setOption = (index: number, value: string) =>
    fireEvent.change(screen.getByLabelText(`Option ${index}`), { target: { value } });

  it('adds, fills and submits options in order', async () => {
    const { stub } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Model' } });
    type('string_enum');
    setOption(1, 'fast');
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    setOption(2, 'balanced');
    fireEvent.change(field('Default value'), { target: { value: 'fast' } });
    submit();

    await waitFor(() => expect(body(stub)).toBeDefined());
    expect(body(stub)).toMatchObject({
      key: 'model',
      valueType: 'string_enum',
      enumOptions: ['fast', 'balanced'],
      defaultValue: 'fast',
    });
  });

  it('never lets the last option be removed', () => {
    renderDialog();
    type('string_enum');
    // An enum with no members can serve nothing, and the API's CHECK rejects it.
    expect(screen.getByRole('button', { name: 'Remove option 1' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByRole('button', { name: 'Remove option 1' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('reorders with the move buttons, disabling them at the ends', () => {
    renderDialog();
    type('string_enum');
    setOption(1, 'first');
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    setOption(2, 'second');

    expect(screen.getByRole('button', { name: 'Move option 1 up' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByRole('button', { name: 'Move option 2 down' }).hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move option 2 up' }));
    expect((screen.getByLabelText('Option 1') as HTMLInputElement).value).toBe('second');
  });

  it('flags a duplicate option against the offending row', async () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Model' } });
    type('string_enum');
    setOption(1, 'same');
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    setOption(2, 'same');
    fireEvent.change(field('Default value'), { target: { value: 'same' } });
    submit();
    await waitFor(() => expect(screen.getByText('Duplicate option')).toBeTruthy());
  });

  it('requires at least one non-blank option', async () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Model' } });
    type('string_enum');
    submit();
    await waitFor(() => expect(screen.getByText('Add at least one option')).toBeTruthy());
  });

  it('requires the default to be one of the options', async () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Model' } });
    type('string_enum');
    setOption(1, 'fast');
    submit();
    // The select cannot offer a non-member, so this surfaces as "pick one".
    await waitFor(() => expect(screen.getByText(/Pick a default option/)).toBeTruthy());
  });

  it('clears the default when the option it pointed at is renamed away', async () => {
    renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Model' } });
    type('string_enum');
    setOption(1, 'fast');
    fireEvent.change(field('Default value'), { target: { value: 'fast' } });
    expect(field('Default value').value).toBe('fast');

    setOption(1, 'quick');
    // Rather than keeping an orphan that the API would reject.
    expect(field('Default value').value).toBe('');
    submit();
    await waitFor(() => expect(screen.getByText(/Pick a default option/)).toBeTruthy());
  });
});

describe('create', () => {
  it('POSTs a boolean flag without a defaultValue', async () => {
    const { stub, onClose } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Kill Switch' } });
    fireEvent.change(field('Description'), { target: { value: 'Turns it all off' } });
    fireEvent.change(field('Tags'), { target: { value: ' billing , ops ' } });
    submit();

    await waitFor(() => expect(body(stub)).toBeDefined());
    expect(body(stub)).toEqual({
      key: 'kill-switch',
      name: 'Kill Switch',
      description: 'Turns it all off',
      tags: ['billing', 'ops'],
      valueType: 'boolean',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sends a null description when the field is left blank', async () => {
    const { stub } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Bare' } });
    submit();
    await waitFor(() => expect(body(stub)).toBeDefined());
    expect((body(stub) as { description: unknown }).description).toBeNull();
  });

  it('POSTs a string flag with its default value', async () => {
    const { stub } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Banner' } });
    type('string');
    fireEvent.change(field('Default value'), { target: { value: 'Hello there' } });
    submit();
    await waitFor(() => expect(body(stub)).toBeDefined());
    expect(body(stub)).toMatchObject({ valueType: 'string', defaultValue: 'Hello there' });
  });

  it('keeps the dialog open and shows why the server refused', async () => {
    const { stub, onClose } = renderDialog(
      {},
      {
        [CREATE]: {
          status: 409,
          body: { error: 'conflict', message: 'A flag with that key already exists' },
        },
      },
    );
    fireEvent.change(field('Name'), { target: { value: 'Dupe' } });
    submit();
    await waitFor(() =>
      expect(screen.getByText('A flag with that key already exists')).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(stub.calls.filter((call) => call.key === CREATE)).toHaveLength(1);
  });

  it('submits once per click, not twice', async () => {
    const { stub } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Once' } });
    submit();
    await waitFor(() => expect(body(stub)).toBeDefined());
    // The submit button carries no onClick - the <form>'s onSubmit is the single
    // path, so Enter and a click cannot both fire the mutation.
    expect(stub.calls.filter((call) => call.key === CREATE)).toHaveLength(1);
  });

  it('closes on cancel without calling the API', () => {
    const { stub, onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(stub.calls.some((call) => call.key === CREATE)).toBe(false);
  });
});

describe('edit', () => {
  const renderEdit = (flag = existing(), handlers: Handlers = {}) =>
    renderDialog({ mode: 'edit', flag }, handlers);

  it('fills the form from the flag and fixes the key and the type', () => {
    renderEdit();
    expect(field('Name').value).toBe('Summarize');
    expect(field('Key').value).toBe('tool.summarize');
    expect(field('Description').value).toBe('Condense long text');
    expect(field('Tags').value).toBe('text');

    // Both are enforced by the API too; disabling them here is the explanation,
    // not the guard.
    expect(field('Key').hasAttribute('disabled')).toBe(true);
    expect(field('Type').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/type is fixed/)).toBeTruthy();
    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
  });

  it('PATCHes only the mutable fields, never the key or the type', async () => {
    const { stub } = renderEdit();
    fireEvent.change(field('Name'), { target: { value: 'Summarise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body(stub, 'PATCH /v1/tools/t1')).toBeDefined());
    const patch = body(stub, 'PATCH /v1/tools/t1') as Record<string, unknown>;
    expect(patch).toEqual({ name: 'Summarise', description: 'Condense long text', tags: ['text'] });
    expect(patch).not.toHaveProperty('key');
    expect(patch).not.toHaveProperty('valueType');
  });

  it('carries an existing enum flag’s options into the editor', () => {
    renderEdit(
      existing({
        valueType: 'string_enum',
        enumOptions: ['fast', 'balanced'],
        defaultValue: 'balanced',
      }),
    );
    expect((screen.getByLabelText('Option 1') as HTMLInputElement).value).toBe('fast');
    expect((screen.getByLabelText('Option 2') as HTMLInputElement).value).toBe('balanced');
    expect(field('Default value').value).toBe('balanced');
  });

  it('sends enumOptions when they are edited', async () => {
    const { stub } = renderEdit(
      existing({ valueType: 'string_enum', enumOptions: ['fast'], defaultValue: 'fast' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'quality' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(body(stub, 'PATCH /v1/tools/t1')).toBeDefined());
    expect(body(stub, 'PATCH /v1/tools/t1')).toMatchObject({
      enumOptions: ['fast', 'quality'],
      defaultValue: 'fast',
    });
  });

  it('says "Saving" rather than "Creating" while it works', async () => {
    let release!: () => void;
    const held = new Promise<unknown>((resolve) => {
      release = () => resolve({});
    });
    const { stub } = renderEdit(existing(), { 'PATCH /v1/tools/t1': () => held });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy());
    release();
    await waitFor(() => expect(body(stub, 'PATCH /v1/tools/t1')).toBeDefined());
  });
});

describe('dialog behaviour', () => {
  it('focuses the first field so the keyboard path works', async () => {
    renderDialog();
    // `autoFocus` never wins against Radix's FocusScope; ui/dialog.tsx redirects
    // focus to the first enabled field instead.
    await waitFor(() => expect(document.activeElement).toBe(field('Name')));
  });

  it('titles itself for the mode it is in', () => {
    renderDialog();
    expect(within(screen.getByRole('dialog')).getByText('Create a flag')).toBeTruthy();
    cleanup();
    renderDialog({ mode: 'edit', flag: existing() });
    expect(within(screen.getByRole('dialog')).getByText('Edit tool.summarize')).toBeTruthy();
  });
});
