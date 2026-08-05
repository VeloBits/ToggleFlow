// @vitest-environment happy-dom
/**
 * The create/edit flag dialog: the key latch, per-type fields, the enum options
 * editor, cross-field validation, the initial-rollout section and the request
 * sequence each of those produces.
 *
 * Driven through the dialog rather than by calling `useFlagForm` directly,
 * because the interesting behaviour is the wiring - which field opens the latch,
 * which fields a type shows, what actually gets POSTed.
 *
 * ## Convention: the workspace provider is mounted
 *
 * The dialog reads the current environment from `useWorkspace`, so these tests
 * render under the real provider (three requests deep) rather than passing
 * `withWorkspace: false`. Everything about the definition fields is available on
 * the first paint; anything that names the environment - the whole rollout
 * section - has to be waited for, which is what `sectionReady` is.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagFormDialog } from '../src/features/flags/FlagFormDialog';
import type { FlagRow } from '../src/features/flags/flag-columns';
import { fieldLabelId, valueControl } from '../src/features/flags/value-controls';
import {
  ENV_ID,
  PROJECT_ID,
  renderWithProviders,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const CREATE = `POST /v1/projects/${PROJECT_ID}/tools`;
/** The state write, addressed to the id the CREATE stub answers with. */
const STATE = `PATCH /v1/environments/${ENV_ID}/tools/new/flag`;

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
    [STATE]: { ok: true },
    ...handlers,
  });
  const onClose = vi.fn();
  renderWithProviders(
    <FlagFormDialog mode="create" projectId={PROJECT_ID} onClose={onClose} {...props} />,
  );
  return { stub, onClose };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (value: string) => fireEvent.change(field('Type'), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create flag' }));
const body = (stub: FetchStub, key = CREATE) => stub.calls.find((call) => call.key === key)?.body;
/** Every write the dialog made, in order - the sequence is half of what is asserted. */
const writes = (stub: FetchStub) =>
  stub.calls.map((call) => call.key).filter((key) => !key.startsWith('GET '));

/** The rollout section names the environment, so it waits on the workspace. */
const rolloutTrigger = () =>
  screen.getByRole('button', { name: /Configure initial rollout in Production/ });
const sectionReady = () => waitFor(() => expect(rolloutTrigger()).toBeTruthy());
/** Off/On, scoped: the default-value field and the rollout section both have one. */
const choice = (label: string, state: 'Off' | 'On') =>
  within(screen.getByLabelText(label)).getByRole('radio', { name: state });

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
    // Boolean: a two-choice group, so the selected state is a word rather than a
    // thumb position. The other two are the elements their values call for.
    expect(field('Default value').getAttribute('role')).toBe('radiogroup');
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

describe('the boolean default value', () => {
  /**
   * The radiogroup itself, since that is what carries the `aria-labelledby`.
   * `SegmentedControl` forwards naming to its own root, so there is no wrapper
   * with a role here - the remaining `div` is layout for the trailing value.
   */
  const group = () => screen.getByLabelText('Default value');
  /** The segments plus the value spelled out beside them, which is their sibling. */
  const control = () => within(group().parentElement!);

  it('is named by its label through aria-labelledby, not htmlFor', () => {
    renderDialog();
    // A `for` pointing at a div dangles: no accessible name, and clicking the
    // label does nothing at all. The pair is inverted instead.
    expect(group().getAttribute('aria-labelledby')).toBe(fieldLabelId('flag-default-value'));
    expect(screen.getByText('Default value').hasAttribute('for')).toBe(false);
    // A string flag's field IS labelable, so that one keeps `htmlFor`.
    type('string');
    expect(screen.getByText('Default value').getAttribute('for')).toBe('flag-default-value');
  });

  it('reads false to begin with, in words and as the value', () => {
    renderDialog();
    expect(choice('Default value', 'Off').getAttribute('aria-checked')).toBe('true');
    expect(control().getByText('false')).toBeTruthy();
  });

  it('changes to true, and says which state is selected', () => {
    renderDialog();
    fireEvent.click(choice('Default value', 'On'));
    expect(choice('Default value', 'On').getAttribute('aria-checked')).toBe('true');
    expect(choice('Default value', 'Off').getAttribute('aria-checked')).toBe('false');
    expect(control().getByText('true')).toBeTruthy();
  });

  it('fills from an existing flag', () => {
    renderDialog({ mode: 'edit', flag: existing({ defaultValue: true }) });
    expect(choice('Default value', 'On').getAttribute('aria-checked')).toBe('true');
  });

  it('sends no defaultValue whichever state is chosen', async () => {
    const { stub } = renderDialog();
    fireEvent.change(field('Name'), { target: { value: 'Kill Switch' } });
    fireEvent.click(choice('Default value', 'On'));
    submit();
    await waitFor(() => expect(body(stub)).toBeDefined());
    // The API rejects a `defaultValue` on a boolean flag rather than ignoring it.
    expect(body(stub)).not.toHaveProperty('defaultValue');
  });

  it('says that a boolean flag stores no value of its own', () => {
    renderDialog();
    expect(screen.getByText(/A boolean flag stores no value of its own/)).toBeTruthy();
    type('string');
    expect(screen.getByText(/Seeded into every environment/)).toBeTruthy();
  });

  it('really disables its segments, rather than only dimming them', () => {
    // Rendered from the registry rather than through the dialog: the dialog never
    // disables this field, and the detail page renders no value editor at all for
    // a boolean flag, so there is no screen that reaches this arm.
    const { Field } = valueControl('boolean');
    const onChange = vi.fn();
    renderWithProviders(
      <>
        <label id={fieldLabelId('bf')}>Default value</label>
        <Field
          id="bf"
          value={true}
          constraints={{ enumOptions: [] }}
          disabled
          onChange={onChange}
        />
      </>,
      { withWorkspace: false },
    );
    /*
     * The assertion is `disabled`, not a dimming class. `SegmentedControl` used
     * to be dimmed with `pointer-events-none opacity-50`, which stops a mouse
     * and leaves the control fully operable from the keyboard - so the one user
     * it misled was the one it was meant to protect.
     */
    expect(choice('Default value', 'Off').hasAttribute('disabled')).toBe(true);
    fireEvent.click(choice('Default value', 'Off'));
    expect(onChange).not.toHaveBeenCalled();
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

  it('keeps the dialog open when the form itself is invalid', async () => {
    const { stub, onClose } = renderDialog();
    submit();
    await waitFor(() => expect(screen.getByText('Name is required')).toBeTruthy());
    /*
     * `useSubmit` closes the dialog when the submit RESOLVES, so an invalid form
     * has to reject: returning quietly threw the whole form away and left the
     * field errors on a dialog that was no longer there.
     */
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Some fields need attention.')).toBeTruthy();
    expect(writes(stub)).toEqual([]);
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

describe('the initial rollout', () => {
  /** Fill the definition, open the section and turn the flag on in Production. */
  const startOn = async (name = 'Banner') => {
    await sectionReady();
    fireEvent.change(field('Name'), { target: { value: name } });
    fireEvent.click(rolloutTrigger());
    fireEvent.click(choice('Status in Production', 'On'));
  };

  it('is collapsed, names the environment, and sends nothing when left alone', async () => {
    const { stub } = renderDialog();
    await sectionReady();
    expect(rolloutTrigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('New flags start off in every environment.')).toBeTruthy();

    fireEvent.change(field('Name'), { target: { value: 'Kill Switch' } });
    submit();

    await waitFor(() => expect(body(stub)).toBeDefined());
    // Exactly one write. A PATCH writing the `enabled: false, rolloutPercent: null`
    // that POST /tools already seeded would be a round trip whose only trace is a
    // junk audit entry against a flag one second old.
    expect(writes(stub)).toEqual([CREATE]);
    await waitFor(() => expect(screen.getByText('kill-switch created')).toBeTruthy());
  });

  it('turns the flag on for everyone in the selected environment', async () => {
    const { stub } = renderDialog();
    await startOn();
    expect(screen.getByText(/Serves every user in Production while the flag is on/)).toBeTruthy();
    expect(screen.getByText(/Every other environment stays off/)).toBeTruthy();
    submit();

    await waitFor(() => expect(body(stub, STATE)).toBeDefined());
    // null, not 0: "everyone while on" and "nobody yet" are opposite outcomes.
    expect(body(stub, STATE)).toEqual({ enabled: true, rolloutPercent: null });
    expect(writes(stub)).toEqual([CREATE, STATE]);
    await waitFor(() =>
      expect(screen.getByText('banner created and turned on in Production')).toBeTruthy(),
    );
  });

  it('rolls out to a percentage of the selected environment', async () => {
    const { stub } = renderDialog();
    await startOn();
    fireEvent.click(
      within(screen.getByLabelText('Rollout audience')).getByRole('radio', {
        name: 'Percentage',
      }),
    );
    fireEvent.change(screen.getByLabelText('Rollout percentage'), { target: { value: '25' } });
    submit();

    await waitFor(() => expect(body(stub, STATE)).toBeDefined());
    expect(body(stub, STATE)).toEqual({ enabled: true, rolloutPercent: 25 });
    // The definition first: the PATCH's URL needs the id the POST returns.
    expect(writes(stub)).toEqual([CREATE, STATE]);
    await waitFor(() =>
      expect(screen.getByText('banner created, rolling out to 25% in Production')).toBeTruthy(),
    );
  });

  it('forgets the rollout when the section is closed again', async () => {
    const { stub } = renderDialog();
    await startOn();
    fireEvent.click(rolloutTrigger());
    // The disclosure IS the switch: a closed section that still wrote would be an
    // invisible change to production.
    expect(screen.getByText('New flags start off in every environment.')).toBeTruthy();
    submit();

    await waitFor(() => expect(body(stub)).toBeDefined());
    expect(writes(stub)).toEqual([CREATE]);
  });

  it('refuses a percentage the API would reject, before writing anything', async () => {
    const { stub } = renderDialog();
    await startOn();
    fireEvent.click(
      within(screen.getByLabelText('Rollout audience')).getByRole('radio', {
        name: 'Percentage',
      }),
    );
    fireEvent.change(screen.getByLabelText('Rollout percentage'), { target: { value: '1.5' } });
    submit();

    await waitFor(() => expect(screen.getByText(/whole number from 0 to 100/)).toBeTruthy());
    // Nothing at all: a flag created and then refused its rollout is the partial
    // state below, and a typo should not reach it.
    expect(writes(stub)).toEqual([]);
  });

  it('reports a flag that was created but not rolled out, and closes on it', async () => {
    const { stub, onClose } = renderDialog(
      {},
      { [STATE]: { status: 403, body: { error: 'forbidden', message: 'role too low' } } },
    );
    await startOn();
    submit();

    await waitFor(() =>
      expect(
        screen.getByText(
          /banner created, but its rollout in Production was not applied: role too low\. Set it on the flag's State tab\./,
        ),
      ).toBeTruthy(),
    );
    // The flag exists, so the dialog closes on it: holding it open would leave a
    // form whose only remaining outcome is a 409 on the key it just took.
    expect(onClose).toHaveBeenCalled();
    expect(writes(stub)).toEqual([CREATE, STATE]);
  });

  it('still reports a rollout failure that carries no message', async () => {
    renderDialog({}, { [STATE]: () => Promise.reject('socket closed') });
    await startOn();
    submit();
    await waitFor(() =>
      expect(screen.getByText(/was not applied: the request failed/)).toBeTruthy(),
    );
  });

  it('is absent in edit mode: per-environment state belongs to the detail page', async () => {
    const { stub } = renderDialog({ mode: 'edit', flag: existing() });
    // Waited on so "absent" is about the mode rather than about an environment
    // that had not arrived yet.
    await waitFor(() => expect(stub.calls.some((c) => c.key.endsWith('/environments'))).toBe(true));
    expect(screen.queryByText(/Configure initial rollout/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body(stub, 'PATCH /v1/tools/t1')).toBeDefined());
    expect(stub.calls.some((call) => call.key.endsWith('/flag'))).toBe(false);
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
