import type { ResolvedProject } from '@setcast/core';
import { bundlePlayer } from '../bundle.ts';
import { serveCapture } from '../server.ts';

export interface PreviewRevision {
  revision: number;
  project: ResolvedProject;
  error: string | null;
}

export async function preview(
  project: ResolvedProject,
  options: { projectDir: string; port?: number },
) {
  const [controls, capture] = await Promise.all([
    bundlePlayer('preview.tsx'),
    bundlePlayer('export.tsx'),
  ]);
  for (const [path, bytes] of capture) controls.set(`/frame${path}`, bytes);
  controls.set(
    '/frame.html',
    Buffer.from(
      `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/frame/player.css"></head><body><div id="player"></div><script type="module" src="/frame/player.js"></script></body></html>`,
    ),
  );
  const state: PreviewRevision = { revision: 0, project, error: null };
  const server = await serveCapture(project, { ...options, files: controls, preview: state });
  return {
    ...server,
    update(next: ResolvedProject) {
      state.project = next;
      state.revision++;
      state.error = null;
    },
    report(message: string) {
      state.error = message;
    },
  };
}
