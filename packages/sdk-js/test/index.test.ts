import { expect, it } from 'vitest';

import { ENGINE_SCHEMA_VERSION, PACKAGE_NAME } from '../src/index';

it('exports the package name', () => {
  expect(PACKAGE_NAME).toBe('@toggleflow/sdk');
});

it('resolves the workspace engine dependency', () => {
  expect(ENGINE_SCHEMA_VERSION).toBe(1);
});
