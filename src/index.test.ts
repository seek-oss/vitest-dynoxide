import { describe, expect, it } from 'vitest';

import { defineConfig } from './index.js';

describe('defineConfig', () => {
  it('returns the config as-is', () => {
    const config = { tables: ['TestTable'] };

    expect(defineConfig(config)).toEqual(config);
  });
});
