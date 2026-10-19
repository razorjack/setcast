import { defineConfig } from 'vite-plus';
export default defineConfig({
  pack: { entry: ['src/index.ts', 'src/browser/main.tsx'], dts: true, format: ['esm'] },
});
