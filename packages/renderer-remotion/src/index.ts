import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { SetcastError, type ResolvedProject } from '@setcast/core';
import { serializeInDirectory } from './cwd.ts';
import { probeAudio } from './probe.ts';
import { resolveFrameRange } from './range.ts';

export { probeAudio } from './probe.ts';

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
  await probeAudio(project, projectDir);
  let downloadingBrowser = false;
  try {
    await ensureBrowser({
      onBrowserDownload: () => {
        downloadingBrowser = true;
        report({ stage: 'browser', progress: 0 });
        return {
          version: null,
          onProgress: ({ percent }) => report({ stage: 'browser', progress: percent }),
        };
      },
    });
  } catch (cause) {
    if (!downloadingBrowser) throw cause;
    throw new SetcastError(
      'Cannot download Chrome Headless Shell',
      "Check your internet connection. Delete the renderer package's node_modules/.remotion directory to retry the download.",
      { cause, exitCode: 1 },
    );
  }
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
  validateVideoFile(options.out);
  const report = options.onProgress ?? (() => {});
  const { serveUrl, composition } = await prepare(project, options.projectDir, report);

  const { fps, durationInFrames } = composition;
  const frameRange = options.range ? resolveFrameRange(options.range, fps, durationInFrames) : null;
  const totalFrames = frameRange ? frameRange[1] - frameRange[0] + 1 : durationInFrames;

  try {
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
  } catch (cause) {
    throw translateRenderError(cause);
  }

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

  try {
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
  } catch (cause) {
    throw translateRenderError(cause);
  }

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

function validateVideoFile(out: string): void {
  if (/\.(?:mp4|mov|mkv)$/i.test(out)) return;
  throw new SetcastError(
    `Cannot write video to ${out}`,
    'Use a .mp4, .mov or .mkv file name. Setcast renders H.264 video with AAC audio.',
  );
}

function translateRenderError(thrown: unknown): Error {
  const cause = thrown instanceof Error ? thrown : new Error(String(thrown));
  const failedImage = cause.message.match(/Failed to load (?:image with src )?(.+)/i)?.[1];
  if (failedImage) {
    return new SetcastError(
      `Cannot read ${failedImage} as an image`,
      'Check the file opens as an image, or re-export it as PNG, JPEG, SVG or WebP.',
      { cause },
    );
  }

  const delay = cause.message.match(
    /A delayRender\(\)(?: "([^"]+)")? was called but not cleared after/i,
  );
  if (delay) {
    const waitingFor = delay[1] ? ` ${delay[1]}` : '';
    return new SetcastError(
      `Render timed out waiting for${waitingFor || ' an asset'}`,
      'Check that the named asset exists and can be decoded. If the system is overloaded, retry with a lower --concurrency.',
      { cause, exitCode: 1 },
    );
  }
  return cause;
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
      else {
        const cause = new Error(
          signal
            ? `Remotion Studio terminated by ${signal}`
            : `Remotion Studio exited with code ${code}`,
        );
        reject(
          new SetcastError(
            signal
              ? `Remotion Studio stopped after ${signal}`
              : `Remotion Studio stopped with exit code ${code}`,
            'Check the Studio output above for the underlying error.',
            { cause, exitCode: 1 },
          ),
        );
      }
    });
    studio.on('error', (cause) =>
      reject(
        new SetcastError(
          'Cannot start Remotion Studio',
          'Check that the project dependencies are installed, then retry.',
          { cause, exitCode: 1 },
        ),
      ),
    );
  });
}
