import { copyFileSync, mkdirSync } from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { server: 'src/server.ts' },
    format: ['esm'],
    outDir: 'dist',
    clean: true,
    splitting: false,
    target: 'node22',
    sourcemap: true,
  },
  {
    entry: { lambda: 'lambda.ts' },
    format: ['esm'],
    outDir: 'dist',
    clean: false,
    splitting: false,
    target: 'node22',
    sourcemap: false,
    bundle: true,
    noExternal: [/.*/],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    onSuccess() {
      mkdirSync('dist/migrations', { recursive: true });
      copyFileSync('src/db/migrations/001_initial.sql', 'dist/migrations/001_initial.sql');
    },
  },
]);
