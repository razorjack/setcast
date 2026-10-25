import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/Root.tsx', 'src/capabilities.ts'],
    dts: true,
    format: ['esm'],
  },
});
