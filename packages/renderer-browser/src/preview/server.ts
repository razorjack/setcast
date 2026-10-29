import type { ExportSettings, ResolvedProject } from '@setcast/core';
import { bundlePlayer } from '../bundle.ts';
import { serveCapture } from '../server.ts';
import { PreviewJobs } from './jobs.ts';
import { PreviewJobApi } from './jobs-http.ts';
import type { PreviewExportOptions } from './jobs-contract.ts';
export type { PreviewExportOptions } from './jobs-contract.ts';

export interface PreviewRevision {
  revision: number;
  project: ResolvedProject;
  error: string | null;
}

export async function preview(
  project: ResolvedProject,
  options: { projectDir: string; port?: number; exports?: PreviewExportOptions },
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
  const jobs = options.exports
    ? new PreviewJobs(state, { ...options.exports, projectDir: options.projectDir })
    : undefined;
  const server = await serveCapture(project, {
    ...options,
    files: controls,
    preview: state,
    exports: jobs ? new PreviewJobApi(jobs) : undefined,
  });
  return {
    ...server,
    async close() {
      try {
        await server.close();
      } finally {
        await jobs?.close();
      }
    },
    update(next: ResolvedProject, settings?: ExportSettings) {
      jobs?.invalidate('The project changed. Create a new export from the current preview.');
      if (settings) jobs?.updateSettings(settings);
      state.project = next;
      state.revision++;
      state.error = null;
    },
    report(message: string) {
      jobs?.invalidate('Project reload failed. Fix the reported error before exporting again.');
      state.error = message;
    },
  };
}
