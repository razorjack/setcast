import { defineConfig } from 'vite-plus';
export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/browser/main.tsx', 'src/export/index.ts', 'src/export/scene.tsx'],
    dts: true,
    format: ['esm'],
  },
});
