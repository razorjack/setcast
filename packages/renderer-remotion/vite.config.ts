import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/Root.tsx'],
    dts: true,
    format: ['esm'],
  },
});
