import { expect, it } from 'vitest';

import { PACKAGE_NAME } from '../src/index';

it('exports the package name', () => {
  expect(PACKAGE_NAME).toBe('@toggleflow/engine');
});
