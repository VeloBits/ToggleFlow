// @vitest-environment happy-dom
/**
 * The segment detail page: building rules without typing JSON, the OR flow, the
 * live preview, and the delete guard.
 *
 * The assertions worth reading are the ones about what the builder makes
 * IMPOSSIBLE - a malformed operator, a mistyped `values` key, a condition that
 * parses but fails the schema. None of those states can be reached from these
 * controls, which is the redesign's actual claim.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectAttribute, SegmentUsage } from '../src/api/client';
import { SegmentDetailPage } from '../src/features/segments';
import {
  ENV_ID,
  ORG_ID,
  PROJECT_ID,
  renderWithProviders,
  requestBody,
  segmentRow,
  stubAuth,
  stubFetch,
  workspaceHandlers,
  type FetchStub,
  type Handlers,
} from './harness';

const SEGMENTS_URL = `/v1/projects/${PROJECT_ID}/segments`;
const USAGE_URL = `${SEGMENTS_URL}/usage`;
const ATTRIBUTES_URL = `/v1/projects/${PROJECT_ID}/attributes`;
const PATCH_KEY = 'PATCH /v1/segments/s1';

const attributes = (): ProjectAttribute[] => [
  { name: 'plan', valueSamples: ['free', 'pro', 'team'], usageCount: 4 },
  { name: 'region', valueSamples: ['eu', 'us'], usageCount: 2 },
];

const usage = (over: Partial<SegmentUsage> = {}): SegmentUsage => ({
  flagCount: 1,
  references: [
    {
      flagId: 't1',
      flagKey: 'tool.summarize',
      flagName: 'Summarize',
      environmentId: ENV_ID,
      environmentKey: 'prod',
      environmentName: 'Production',
    },
  ],
  ...over,
});

const pageHandlers = (
  role: 'admin' | 'developer' | 'viewer' = 'admin',
  over: Handlers = {},
): Handlers => ({
  ...workspaceHandlers(role),
  [`GET ${SEGMENTS_URL}`]: [segmentRow()],
  [`GET ${USAGE_URL}`]: {},
  [`GET ${ATTRIBUTES_URL}`]: attributes(),
  [`GET /v1/orgs/${ORG_ID}/audit`]: { entries: [] },
  [`GET /v1/orgs/${ORG_ID}/members`]: [],
  ...over,
});

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

/**
 * `tab` goes through the URL rather than a click, because the page drives its
 * tabs from `?tab=` - and because Radix's tabs activate on FOCUS under the default
 * automatic activation mode, so a bare `fireEvent.click` moves the highlight
 * without mounting the panel.
 */
function renderPage(handlers: Handlers = pageHandlers(), tab?: string): { stub: FetchStub } {
  stubAuth();
  const stub = stubFetch(handlers);
  renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        {/* The page reads :segmentId from useParams, so it needs a real route. */}
        <Route path="/segments/:segmentId" element={<SegmentDetailPage />} />
        <Route path="/segments" element={<span>list stub</span>} />
      </Routes>
    </>,
    { route: tab === undefined ? '/segments/s1' : `/segments/s1?tab=${tab}` },
  );
  return { stub };
}

/**
 * The builder is mounted once its first condition row exists.
 *
 * Gated on the LABEL, not on the displayed value: the preview panel seeds itself
 * with the attributes the rules mention, so `getByDisplayValue('plan')` matches
 * both the builder's attribute field and the preview's - and the builder's label
 * ("User attribute") is the one that is unique to it.
 */
const loaded = () => waitFor(() => expect(screen.getByLabelText('User attribute')).toBeTruthy());

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('reports a segment that is not in the project', async () => {
    renderPage(pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [] }));
    await waitFor(() => expect(screen.getByText('Segment not found')).toBeTruthy());
  });

  it('shows the key as a copyable breadcrumb leaf', async () => {
    renderPage();
    await loaded();
    // The key is what goes into a flag's targeting rule, so it is copyable where
    // it is displayed.
    expect(screen.getByLabelText('Copy key beta-users')).toBeTruthy();
  });
});

describe('rule builder', () => {
  it('renders the stored condition as three controls, not JSON', async () => {
    renderPage();
    await loaded();
    expect(screen.getByLabelText('User attribute')).toHaveProperty('value', 'plan');
    // `in` reads as "is one of" - the engine's own names never reach the screen.
    expect(screen.getByLabelText('Operator')).toHaveProperty('value', 'in');
    // The chip, addressed by its own remove button so the assertion cannot drift
    // onto the value-sample datalist.
    expect(screen.getByLabelText('Remove pro')).toBeTruthy();
    expect(screen.queryByText(/\{"attribute"/)).toBeNull();
  });

  it('offers only operators the engine implements', async () => {
    renderPage();
    await loaded();
    const options = within(screen.getByLabelText('Operator'))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toEqual(['eq', 'neq', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'exists']);
  });

  it('drops the value field for an operator that takes no value', async () => {
    renderPage();
    await loaded();
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'exists' } });
    // Absent rather than disabled: a greyed box invites you to wonder what goes in it.
    expect(screen.queryByLabelText('Value')).toBeNull();
  });

  it('keeps typed input when the operator changes and changes back', async () => {
    renderPage();
    await loaded();
    // The chip survives a trip through a scalar operator - the whole reason a
    // draft type exists rather than editing the discriminated union directly.
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'eq' } });
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'in' } });
    expect(screen.getByLabelText('Remove pro')).toBeTruthy();
  });

  it('suggests attributes and their values from the project', async () => {
    renderPage();
    await loaded();
    await waitFor(() => expect(document.querySelectorAll('datalist').length).toBeGreaterThan(0));
    const options = [...document.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(options).toContain('region');
    // Value samples for the attribute currently named.
    expect(options).toContain('team');
  });

  it('warns that an empty segment matches everyone', async () => {
    renderPage(pageHandlers('admin', { [`GET ${SEGMENTS_URL}`]: [segmentRow({ rules: [[]] })] }));
    await waitFor(() => expect(screen.getByText(/every user/)).toBeTruthy());
    expect(screen.getByText(/Add a\s+condition to narrow it/)).toBeTruthy();
  });
});

describe('saving', () => {
  it('leaves Save inert until something changes', async () => {
    renderPage();
    await loaded();
    expect(screen.getByText('Save changes')).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta cohort' } });
    expect(screen.getByText('Save changes')).toHaveProperty('disabled', false);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('is not dirty when the server sent its keys in another order', async () => {
    /*
     * REGRESSION. `segments.rules` is a jsonb column and Postgres does not
     * preserve object key order, so a real response carries
     * `{values, operator, attribute}` while the builder rebuilds
     * `{attribute, operator, values}`. A `JSON.stringify` comparison against the
     * raw response therefore reported every freshly-loaded segment as edited: the
     * Save button was live before anyone touched anything, and "Unsaved changes"
     * meant nothing. Only reproducible with the keys genuinely reordered, which is
     * why the fixture cannot be written in the natural order here.
     */
    renderPage(
      pageHandlers('admin', {
        [`GET ${SEGMENTS_URL}`]: [
          {
            ...segmentRow(),
            rules: [[{ values: ['pro'], operator: 'in', attribute: 'plan' }]],
          },
        ],
      }),
    );
    await loaded();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.getByText('Save changes')).toHaveProperty('disabled', true);
  });

  it('PATCHes the whole draft in one request', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta cohort' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  ' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(true));
    expect(requestBody(stub, PATCH_KEY)).toEqual({
      name: 'Beta cohort',
      // Whitespace-only clears to null rather than storing blanks.
      description: null,
      match: 'all',
      rules: [[{ attribute: 'plan', operator: 'in', values: ['pro'] }]],
    });
  });

  it('refetches the activity panel after saving', async () => {
    /*
     * REGRESSION. Every segment write lands an `audit_log` row, and the activity
     * panel sits beside the Save button - so without invalidating the audit query
     * a save left "No recorded changes yet." on screen next to the change it had
     * just recorded, which on an audit surface reads as the trail being broken.
     */
    const AUDIT_KEY = `GET /v1/orgs/${ORG_ID}/audit`;
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();
    await waitFor(() => expect(stub.calls.some((c) => c.key.startsWith(AUDIT_KEY))).toBe(true));
    const before = stub.calls.filter((c) => c.key.startsWith(AUDIT_KEY)).length;

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta cohort' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(stub.calls.filter((c) => c.key.startsWith(AUDIT_KEY)).length).toBeGreaterThan(before),
    );
  });

  it('coerces a numeric value so the rule can actually match', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();

    fireEvent.change(screen.getByLabelText('User attribute'), { target: { value: 'seats' } });
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'gte' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(true));
    // 5, not "5": the engine compares with === against a real number.
    expect(requestBody(stub, PATCH_KEY)).toMatchObject({
      rules: [[{ attribute: 'seats', operator: 'gte', value: 5 }]],
    });
  });

  it('refuses to save a contradictory condition', async () => {
    const { stub } = renderPage();
    await loaded();

    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'gte' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'abc' } });
    expect(screen.getByText('This operator needs a number.')).toBeTruthy();

    fireEvent.click(screen.getByText('Save changes'));
    expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(false);
  });

  it('sends one empty group for a segment cleared to nothing', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();

    fireEvent.change(screen.getByLabelText('User attribute'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Remove pro'));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(true));
    // The API requires at least one group; `[[]]` is the stored form of
    // "matches everyone".
    expect(requestBody(stub, PATCH_KEY)).toMatchObject({ rules: [[]] });
  });

  it('surfaces a rejected save', async () => {
    renderPage(
      pageHandlers('admin', {
        [PATCH_KEY]: { status: 403, body: { error: 'forbidden', message: 'not allowed' } },
      }),
    );
    await loaded();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(screen.getByText('not allowed')).toBeTruthy());
  });
});

describe('OR rule sets', () => {
  it('switches to OR when a second set is added, and shows the divider', async () => {
    renderPage();
    await loaded();
    // With one group AND and OR mean the same thing, so the control is absent.
    expect(screen.queryByLabelText('How rule sets combine')).toBeNull();

    fireEvent.click(screen.getByText(/Add rule set/));

    // The reason anyone adds a second set is OR, so it switches without a
    // second gesture - and the control appears so it can be switched back.
    expect(screen.getByLabelText('How rule sets combine')).toBeTruthy();
    expect(screen.getByText('OR')).toBeTruthy();
    expect(screen.getByText(/ANY ONE rule set/)).toBeTruthy();
  });

  it('saves an ORed segment as several groups', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();

    fireEvent.click(screen.getByText(/Add rule set/));
    const attributeFields = screen.getAllByLabelText('User attribute');
    fireEvent.change(attributeFields[1]!, { target: { value: 'country' } });
    const valueFields = screen.getAllByLabelText('Value');
    fireEvent.change(valueFields[valueFields.length - 1]!, { target: { value: 'us' } });

    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(true));
    expect(requestBody(stub, PATCH_KEY)).toMatchObject({
      match: 'any',
      rules: [
        [{ attribute: 'plan', operator: 'in', values: ['pro'] }],
        [{ attribute: 'country', operator: 'eq', value: 'us' }],
      ],
    });
  });

  it('drops a rule set left empty rather than widening the segment', async () => {
    const { stub } = renderPage(pageHandlers('admin', { [PATCH_KEY]: segmentRow() }));
    await loaded();

    // An empty group matches everyone, so under OR keeping it would hand the
    // segment to every user - the one silent failure this must not allow.
    fireEvent.click(screen.getByText(/Add rule set/));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Beta cohort' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(stub.calls.some((c) => c.key === PATCH_KEY)).toBe(true));
    expect(requestBody(stub, PATCH_KEY)).toMatchObject({
      rules: [[{ attribute: 'plan', operator: 'in', values: ['pro'] }]],
    });
  });
});

describe('live preview', () => {
  it('runs the real engine over the draft and explains the verdict', async () => {
    renderPage();
    await loaded();

    // Seeded with the attribute the rules mention, so there is nothing to guess.
    const valueField = screen.getByLabelText('Value for plan');
    fireEvent.change(valueField, { target: { value: 'pro' } });
    await waitFor(() => expect(screen.getByText('In this segment')).toBeTruthy());
    expect(screen.getByText('plan is one of pro')).toBeTruthy();

    fireEvent.change(valueField, { target: { value: 'free' } });
    await waitFor(() => expect(screen.getByText('Not in this segment')).toBeTruthy());
  });

  it('answers against the unsaved draft', async () => {
    renderPage();
    await loaded();
    // Edit the rule but do not save; the preview must follow the draft, because
    // "will this work" is the question worth answering before writing.
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'eq' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'pro' } });
    fireEvent.change(screen.getByLabelText('Value for plan'), { target: { value: 'pro' } });
    await waitFor(() => expect(screen.getByText('In this segment')).toBeTruthy());
    expect(screen.getByText('plan is pro')).toBeTruthy();
  });

  it('shows a number-vs-text mismatch as a failure', async () => {
    renderPage();
    await loaded();
    fireEvent.change(screen.getByLabelText('User attribute'), { target: { value: 'seats' } });
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'eq' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '5' } });
    // Both coerce to the number 5, so this matches - the case the coercion exists
    // for, visible before saving.
    fireEvent.change(screen.getByLabelText('Attribute name'), { target: { value: 'seats' } });
    fireEvent.change(screen.getByLabelText('Value for seats'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByText('In this segment')).toBeTruthy());
  });
});

describe('usage and deletion', () => {
  it('lists the flags that reference the segment', async () => {
    renderPage(pageHandlers('admin', { [`GET ${USAGE_URL}`]: { 'beta-users': usage() } }), 'usage');
    await waitFor(() => expect(screen.getByText('Summarize')).toBeTruthy());
    expect(screen.getByText('Production')).toBeTruthy();
  });

  it('says so when nothing references it', async () => {
    renderPage(pageHandlers(), 'usage');
    await waitFor(() => expect(screen.getByText('Not used by any flag')).toBeTruthy());
  });

  it('warns before deleting a segment a rule still names', async () => {
    renderPage(
      pageHandlers('admin', { [`GET ${USAGE_URL}`]: { 'beta-users': usage() } }),
      'settings',
    );

    // Deleting it makes every rule naming it match nobody, silently - so the
    // confirmation carries the count rather than a generic "are you sure".
    await waitFor(() => expect(screen.getByText(/still/)).toBeTruthy());
    fireEvent.click(screen.getByText('Delete segment'));
    expect(screen.getByText(/Delete anyway — 1 references/)).toBeTruthy();
  });

  it('deletes and returns to the list', async () => {
    const { stub } = renderPage(
      pageHandlers('admin', { 'DELETE /v1/segments/s1': { status: 204 } }),
      'settings',
    );
    await waitFor(() => expect(screen.getByText('Delete segment')).toBeTruthy());

    fireEvent.click(screen.getByText('Delete segment'));
    // Two-step: the first click only arms.
    expect(stub.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);
    fireEvent.click(screen.getByText('Confirm delete'));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/segments'));
  });

  it('offers deletion to an admin only', async () => {
    renderPage(pageHandlers('developer'), 'settings');
    await waitFor(() =>
      expect(screen.getByText('Only an admin can delete a segment.')).toBeTruthy(),
    );
  });
});

describe('permissions', () => {
  it('gives a viewer a read-only page', async () => {
    renderPage(pageHandlers('viewer'));
    await loaded();
    expect(screen.queryByText('Save changes')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('User attribute')).toHaveProperty('disabled', true);
  });
});
