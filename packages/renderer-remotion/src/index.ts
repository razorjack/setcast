import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import type { ResolvedProject } from '@setcast/core';
import { resolveFrameRange } from './range.ts';

export const ENTRY = fileURLToPath(new URL('../entry/index.tsx', import.meta.url));
const PACKAGE_ROOT = dirname(dirname(ENTRY));
const COMPOSITION_ID = 'setcast';

export type RenderStage = 'browser' | 'bundle' | 'frames' | 'encode';

export interface RenderProgress {
  stage: RenderStage;
  /** 0..1 within the stage. */
  progress: number;
  renderedFrames?: number;
  totalFrames?: number;
}

export interface RenderOptions {
  projectDir: string;
  out: string;
  /** Seconds; inclusive start, exclusive end. */
  range?: [number, number];
  concurrency?: number;
  onProgress?: (p: RenderProgress) => void;
}

export interface RenderResult {
  file: string;
  frames: number;
  durationSeconds: number;
}

export async function render(project: ResolvedProject, opts: RenderOptions): Promise<RenderResult> {
  // Remotion keeps its browser download and webpack cache under the nearest package.json of
  // process.cwd(). Run from this package so every project shares one cache instead of each
  // project directory growing a 100 MB .remotion folder.
  const cwd = process.cwd();
  process.chdir(PACKAGE_ROOT);
  try {
    return await renderIn(project, opts);
  } finally {
    process.chdir(cwd);
  }
}

async function renderIn(project: ResolvedProject, opts: RenderOptions): Promise<RenderResult> {
  const report = opts.onProgress ?? (() => {});

  report({ stage: 'browser', progress: 0 });
  await ensureBrowser({
    onBrowserDownload: () => ({
      version: null,
      onProgress: ({ percent }) => report({ stage: 'browser', progress: percent }),
    }),
  });
  report({ stage: 'browser', progress: 1 });

  const serveUrl = await bundle({
    entryPoint: ENTRY,
    rootDir: PACKAGE_ROOT,
    publicDir: opts.projectDir,
    onProgress: (percent) => report({ stage: 'bundle', progress: percent / 100 }),
  });

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: project,
  });
  const { fps, durationInFrames } = composition;
  const frameRange = opts.range ? resolveFrameRange(opts.range, fps, durationInFrames) : null;
  const totalFrames = frameRange ? frameRange[1] - frameRange[0] + 1 : durationInFrames;

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation: opts.out,
    inputProps: project,
    frameRange,
    concurrency: opts.concurrency ?? null,
    onProgress: ({ renderedFrames, encodedFrames, stitchStage }) => {
      if (renderedFrames < totalFrames) {
        report({
          stage: 'frames',
          progress: renderedFrames / totalFrames,
          renderedFrames,
          totalFrames,
        });
      } else {
        const done = stitchStage === 'muxing' ? totalFrames : encodedFrames;
        report({ stage: 'encode', progress: done / totalFrames, renderedFrames, totalFrames });
      }
    },
  });

  return { file: opts.out, frames: totalFrames, durationSeconds: totalFrames / fps };
}

export interface PreviewOptions {
  projectDir: string;
  port?: number;
}

/** Opens Remotion Studio on the project. Resolves when Studio exits. */
export async function preview(project: ResolvedProject, opts: PreviewOptions): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-'));
  const propsFile = join(dir, 'props.json');
  await writeFile(propsFile, JSON.stringify(project));
  const cli = fileURLToPath(import.meta.resolve('@remotion/cli/package.json'));
  const bin = join(dirname(cli), 'remotion-cli.js');
  const args = ['studio', ENTRY, '--props', propsFile, '--public-dir', opts.projectDir];
  if (opts.port) args.push('--port', String(opts.port));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd: PACKAGE_ROOT, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 || code === null
        ? resolve()
        : reject(new Error(`Remotion Studio exited with code ${code}`)),
    );
    child.on('error', reject);
  });
}
