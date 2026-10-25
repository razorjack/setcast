import { defineConfig } from 'vite-plus';
export default defineConfig({
  pack: {
    entry: [
      'src/index.ts',
      'src/capabilities.ts',
      'src/browser/main.tsx',
      'src/export/index.ts',
      'src/export/scene.tsx',
      'src/preview/server.ts',
      'src/preview/main.tsx',
    ],
    dts: true,
    format: ['esm'],
  },
});
