import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/main.ts'],
    dts: false,
    format: ['esm'],
  },
});
