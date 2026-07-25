import { expect, it } from 'vitest';

import { ENGINE_PACKAGE_NAME, PACKAGE_NAME } from '../src/index';

it('exports the package name', () => {
  expect(PACKAGE_NAME).toBe('@toggleflow/sdk');
});

it('resolves the workspace engine dependency', () => {
  expect(ENGINE_PACKAGE_NAME).toBe('@toggleflow/engine');
});
