import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build (includes self-test subpath so DTS is emitted in the same pass)
  {
    entry: ['src/index.ts', 'src/self-test/harness.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: ['puppeteer'],
  },
  // CLI build
  {
    entry: ['src/cli/index.ts'],
    format: ['cjs'],
    outDir: 'dist/cli',
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    external: ['puppeteer'],
  },
  // Server build
  {
    entry: ['src/server/index.ts'],
    format: ['cjs'],
    outDir: 'dist/server',
    sourcemap: true,
    external: ['puppeteer', 'express'],
  },
])
