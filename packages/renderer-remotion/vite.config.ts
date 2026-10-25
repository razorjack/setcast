import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/Root.tsx', 'src/capabilities.ts', 'src/diagnostics.ts'],
    dts: true,
    format: ['esm'],
  },
});
