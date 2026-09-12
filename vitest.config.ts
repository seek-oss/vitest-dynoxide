import { Vitest } from 'skuba';
import { defineConfig } from 'vitest/config';

export default defineConfig(
  Vitest.mergePreset({
    ssr: {
      resolve: {
        conditions: ['@seek/vitest-dynoxide/source'],
      },
    },
    test: {
      env: {
        DEPLOYMENT: 'test',
      },
      projects: [
        {
          extends: true,
          test: {
            include: ['src/**/*.test.ts'],
            name: 'unit',
          },
        },
        {
          extends: true,
          test: {
            name: 'default',
            globalSetup: [
              './tests/default/vitest.setup.ts',
              './src/globalSetup.ts',
            ],
            include: ['tests/default/**/*.test.ts'],
            setupFiles: ['vitest-dynoxide/setupFile'],
          },
        },
      ],
      coverage: {
        thresholds: {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        exclude: ['src/testing'],
      },
    },
  }),
);
