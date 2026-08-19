import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/react/index.ts', 'src/node/index.ts'],
    dts: true,
    format: ['esm'],
  },
});
