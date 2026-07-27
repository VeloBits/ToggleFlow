// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createBrowserClient,
  type FlagsSnapshot,
  type ToggleFlowBrowserClient,
} from '../src/browser';
import { ToggleFlowProvider, useConfig, useFlag } from '../src/react';
import { createFakeFetch, jsonResponse } from './fake-fetch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload = (enabled: boolean, label: string, version: number): FlagsSnapshot => ({
  environmentId: 'env-1',
  environmentKey: 'prod',
  version,
  flags: { 'tool.x': { enabled, config: { label }, fallback: null } },
});

const openClients: ToggleFlowBrowserClient[] = [];
afterEach(() => {
  for (const client of openClients.splice(0)) client.close();
});

function Probe() {
  const enabled = useFlag('tool.x');
  const config = useConfig('tool.x');
  return (
    <div data-testid="probe">
      {enabled ? 'on' : 'off'}:{config ? String(config.label) : 'none'}
    </div>
  );
}

describe('react adapter', () => {
  it('useFlag/useConfig render current state and re-render on updates', async () => {
    const fake = createFakeFetch(() => jsonResponse(payload(false, 'v1', 1)));
    const client = createBrowserClient({
      edgeUrl: 'http://edge.test',
      environmentId: 'env-1',
      clientKey: 'tf_cli_test',
      user: { key: 'u1' },
      fetch: fake.fetch,
    });
    openClients.push(client);
    await client.waitForReady();

    render(
      <ToggleFlowProvider client={client}>
        <Probe />
      </ToggleFlowProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('off:v1');

    fake.setHandler(() => jsonResponse(payload(true, 'v2', 2)));
    await act(() => client.refreshNow());
    expect(screen.getByTestId('probe').textContent).toBe('on:v2');
  });

  it('renders safe defaults for unknown tools', async () => {
    const fake = createFakeFetch(() => jsonResponse(payload(true, 'v1', 1)));
    const client = createBrowserClient({
      edgeUrl: 'http://edge.test',
      environmentId: 'env-1',
      clientKey: 'tf_cli_test',
      user: { key: 'u1' },
      fetch: fake.fetch,
    });
    openClients.push(client);
    await client.waitForReady();

    function Unknown() {
      const enabled = useFlag('tool.missing');
      const config = useConfig('tool.missing');
      return (
        <div data-testid="unknown">
          {String(enabled)}:{String(config)}
        </div>
      );
    }
    render(
      <ToggleFlowProvider client={client}>
        <Unknown />
      </ToggleFlowProvider>,
    );
    expect(screen.getByTestId('unknown').textContent).toBe('false:null');
  });
});
