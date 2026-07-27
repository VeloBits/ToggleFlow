import { describe, expect, it } from 'vitest';

import * as sdk from '../src/index';

describe('public surface', () => {
  it('exports both clients, the middleware helpers, and ANONYMOUS', () => {
    expect(typeof sdk.createServerClient).toBe('function');
    expect(typeof sdk.ToggleFlowServerClient).toBe('function');
    expect(typeof sdk.createBrowserClient).toBe('function');
    expect(typeof sdk.ToggleFlowBrowserClient).toBe('function');
    expect(typeof sdk.expressToolGuard).toBe('function');
    expect(typeof sdk.fastifyToolGuard).toBe('function');
    expect(typeof sdk.matchRoute).toBe('function');
    expect(typeof sdk.resolveDisabledResponse).toBe('function');
    expect(sdk.ANONYMOUS).toEqual({ key: 'anonymous' });
  });

  it('keeps React out of the main entry (optional peer dep behind ./react)', () => {
    expect(Object.keys(sdk)).not.toContain('ToggleFlowProvider');
    expect(Object.keys(sdk)).not.toContain('useFlag');
  });
});
