import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build
  {
    entry: ['src/index.ts'],
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
])
