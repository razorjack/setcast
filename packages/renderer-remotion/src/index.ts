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
  /** `browser` is reported only while Chrome Headless Shell is being downloaded. */
  stage: RenderStage;
  /** 0..1 within the stage. */
  progress: number;
  renderedFrames?: number;
  totalFrames?: number;
}

type Report = (progress: RenderProgress) => void;

export interface RenderOptions {
  projectDir: string;
  out: string;
  /** Seconds; inclusive start, exclusive end. */
  range?: [number, number];
  concurrency?: number;
  crf?: number;
  jpegQuality?: number;
  onProgress?: Report;
}

export interface RenderResult {
  file: string;
  frames: number;
  durationSeconds: number;
}

const renderInPackage = serializeInDirectory(PACKAGE_ROOT);

export function render(project: ResolvedProject, options: RenderOptions): Promise<RenderResult> {
  // Remotion keeps its browser download and webpack cache under the nearest package.json of
  // process.cwd(). Run from this package so every project shares one cache instead of each
  // project directory growing a 100 MB .remotion folder. Renders are serialized because cwd is
  // process-global.
  return renderInPackage(() => renderIn(project, options));
}

/** Browser, bundle and composition: everything both a render and a still need first. */
async function prepare(project: ResolvedProject, projectDir: string, report: Report) {
  await ensureBrowser({
    onBrowserDownload: () => {
      report({ stage: 'browser', progress: 0 });
      return {
        version: null,
        onProgress: ({ percent }) => report({ stage: 'browser', progress: percent }),
      };
    },
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

async function renderIn(project: ResolvedProject, options: RenderOptions): Promise<RenderResult> {
  const report = options.onProgress ?? (() => {});
  const { serveUrl, composition } = await prepare(project, options.projectDir, report);

  const { fps, durationInFrames } = composition;
  const frameRange = options.range ? resolveFrameRange(options.range, fps, durationInFrames) : null;
  const totalFrames = frameRange ? frameRange[1] - frameRange[0] + 1 : durationInFrames;

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    crf: options.crf ?? null,
    jpegQuality: options.jpegQuality ?? 95,
    outputLocation: options.out,
    inputProps: project,
    frameRange,
    concurrency: options.concurrency ?? null,
    // Remotion counts rendered and encoded frames on one callback; Setcast shows them as stages.
    onProgress: ({ renderedFrames, encodedFrames, stitchStage }) => {
      if (renderedFrames < totalFrames) {
        const progress = renderedFrames / totalFrames;
        report({ stage: 'frames', progress, renderedFrames, totalFrames });
        return;
      }
      // Muxing runs after the last frame is encoded, and reports no count of its own.
      const encoded = stitchStage === 'muxing' ? totalFrames : encodedFrames;
      report({ stage: 'encode', progress: encoded / totalFrames, renderedFrames, totalFrames });
    },
  });

  return { file: options.out, frames: totalFrames, durationSeconds: totalFrames / fps };
}

export interface StillOptions {
  projectDir: string;
  out: string;
  /** Seconds into the set. Defaults to a quarter of the way in. */
  at?: number;
  jpegQuality?: number;
  onProgress?: Report;
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
export function still(project: ResolvedProject, options: StillOptions): Promise<StillResult> {
  return renderInPackage(() => stillIn(project, options));
}

async function stillIn(project: ResolvedProject, options: StillOptions): Promise<StillResult> {
  const imageFormat = stillFormat(options.out);
  const report = options.onProgress ?? (() => {});
  const { serveUrl, composition } = await prepare(project, options.projectDir, report);

  const { fps, durationInFrames } = composition;
  const at = options.at ?? durationInFrames / fps / 4;
  const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(at * fps)));

  await renderStill({
    composition,
    serveUrl,
    output: options.out,
    frame,
    inputProps: project,
    imageFormat,
    // Remotion rejects a quality for a lossless format, so png and webp must pass none.
    jpegQuality: imageFormat === 'jpeg' ? (options.jpegQuality ?? 95) : undefined,
  });

  return { file: options.out, timeSeconds: frame / fps };
}

function stillFormat(out: string): 'png' | 'jpeg' | 'webp' {
  const format = STILL_FORMATS[out.split('.').pop()?.toLowerCase() ?? ''];
  if (format) return format;
  throw new SetcastError(
    `Cannot write a still to ${out}`,
    `Use a .png, .jpg or .webp file name for --out. Setcast picks the format from the extension.`,
  );
}

export interface PreviewOptions {
  projectDir: string;
  port?: number;
}

/** Opens Remotion Studio on the project. Resolves when Studio exits. */
export async function preview(project: ResolvedProject, options: PreviewOptions): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-'));
  try {
    const propsFile = join(dir, 'props.json');
    await writeFile(propsFile, JSON.stringify(project));
    await runStudio(studioArgs(propsFile, options));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function studioArgs(propsFile: string, options: PreviewOptions): string[] {
  const args = ['studio', ENTRY, '--props', propsFile, '--public-dir', options.projectDir];
  if (options.port) args.push('--port', String(options.port));
  return args;
}

/** Studio has no programmatic API, so it runs as its own process until the user stops it. */
function runStudio(args: string[]): Promise<void> {
  const cliPackage = fileURLToPath(import.meta.resolve('@remotion/cli/package.json'));
  const bin = join(dirname(cliPackage), 'remotion-cli.js');

  return new Promise((resolve, reject) => {
    const studio = spawn(process.execPath, [bin, ...args], {
      cwd: PACKAGE_ROOT,
      stdio: 'inherit',
    });
    studio.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else if (signal) reject(new Error(`Remotion Studio terminated by ${signal}`));
      else reject(new Error(`Remotion Studio exited with code ${code}`));
    });
    studio.on('error', reject);
  });
}
