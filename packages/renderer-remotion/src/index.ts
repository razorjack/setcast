import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { SetcastError, type ResolvedProject } from '@setcast/core';
import { serializeInDirectory } from './cwd.ts';
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
  crf?: number;
  jpegQuality?: number;
  onProgress?: (p: RenderProgress) => void;
}

export interface RenderResult {
  file: string;
  frames: number;
  durationSeconds: number;
}

const renderInPackage = serializeInDirectory(PACKAGE_ROOT);

export function render(project: ResolvedProject, opts: RenderOptions): Promise<RenderResult> {
  // Remotion keeps its browser download and webpack cache under the nearest package.json of
  // process.cwd(). Run from this package so every project shares one cache instead of each
  // project directory growing a 100 MB .remotion folder. Renders are serialized because cwd is
  // process-global.
  return renderInPackage(() => renderIn(project, opts));
}

/** Browser, bundle and composition: everything both a render and a still need first. */
async function prepare(
  project: ResolvedProject,
  projectDir: string,
  report: (p: RenderProgress) => void,
) {
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
    publicDir: projectDir,
    onProgress: (percent) => report({ stage: 'bundle', progress: percent / 100 }),
  });

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: project,
  });
  return { serveUrl, composition };
}

async function renderIn(project: ResolvedProject, opts: RenderOptions): Promise<RenderResult> {
  const report = opts.onProgress ?? (() => {});
  const { serveUrl, composition } = await prepare(project, opts.projectDir, report);
  const { fps, durationInFrames } = composition;
  const frameRange = opts.range ? resolveFrameRange(opts.range, fps, durationInFrames) : null;
  const totalFrames = frameRange ? frameRange[1] - frameRange[0] + 1 : durationInFrames;

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    crf: opts.crf ?? null,
    jpegQuality: opts.jpegQuality ?? 95,
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

export interface StillOptions {
  projectDir: string;
  out: string;
  /** Seconds into the set. Defaults to a quarter of the way in. */
  at?: number;
  jpegQuality?: number;
  onProgress?: (p: RenderProgress) => void;
}

export interface StillResult {
  file: string;
  /** The moment actually grabbed, after rounding to a frame and clamping to the set. */
  timeSeconds: number;
}

const STILL_FORMATS: Record<string, 'png' | 'jpeg' | 'webp'> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
};

/** Renders a single frame as an image, for a thumbnail. */
export function still(project: ResolvedProject, opts: StillOptions): Promise<StillResult> {
  return renderInPackage(() => stillIn(project, opts));
}

async function stillIn(project: ResolvedProject, opts: StillOptions): Promise<StillResult> {
  const imageFormat = STILL_FORMATS[opts.out.split('.').pop()?.toLowerCase() ?? ''];
  if (!imageFormat) {
    throw new SetcastError(
      `Cannot write a still to ${opts.out}`,
      `Use a .png, .jpg or .webp file name for --out. Setcast picks the format from the extension.`,
    );
  }
  const report = opts.onProgress ?? (() => {});
  const { serveUrl, composition } = await prepare(project, opts.projectDir, report);
  const { fps, durationInFrames } = composition;
  const wanted = opts.at ?? durationInFrames / fps / 4;
  const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(wanted * fps)));

  await renderStill({
    composition,
    serveUrl,
    output: opts.out,
    frame,
    inputProps: project,
    imageFormat,
    jpegQuality: opts.jpegQuality ?? 95,
  });

  return { file: opts.out, timeSeconds: frame / fps };
}

export interface PreviewOptions {
  projectDir: string;
  port?: number;
}

/** Opens Remotion Studio on the project. Resolves when Studio exits. */
export async function preview(project: ResolvedProject, opts: PreviewOptions): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-'));
  try {
    const propsFile = join(dir, 'props.json');
    await writeFile(propsFile, JSON.stringify(project));
    const cli = fileURLToPath(import.meta.resolve('@remotion/cli/package.json'));
    const bin = join(dirname(cli), 'remotion-cli.js');
    const args = ['studio', ENTRY, '--props', propsFile, '--public-dir', opts.projectDir];
    if (opts.port) args.push('--port', String(opts.port));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [bin, ...args], {
        cwd: PACKAGE_ROOT,
        stdio: 'inherit',
      });
      child.on('exit', (code, signal) => {
        if (code === 0) resolve();
        else if (signal) reject(new Error(`Remotion Studio terminated by ${signal}`));
        else reject(new Error(`Remotion Studio exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
