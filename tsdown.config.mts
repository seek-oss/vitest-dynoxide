import { defineConfig } from 'tsdown/config';

export default defineConfig({
  failOnWarn: true,
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: 'lib',
  dts: true,
  exports: {
    devExports: '@seek/vitest-dynoxide/source',
  },
  inputOptions: {
    resolve: {
      conditionNames: ['@seek/vitest-dynoxide/source']
    }
  },
  publint: true,
  attw: {
    'profile': 'esm-only'
  },
});
