import { spawn } from 'node:child_process';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStill } from '@remotion/renderer';
import {
  defaultStillTime,
  readMixDocument,
  SetcastError,
  type GraphicsBackend,
  type RenderOptions,
  type RenderResult,
  type RenderReport,
  type StillOptions,
  type StillResult,
  type ResolvedProject,
} from '@setcast/core';
import { serializeInDirectory } from './cwd.ts';
import { resolveFrameRange } from './range.ts';
import { graphicsOptions } from './graphics.ts';
import { encodingOptions, studioEncodingArgs, type EncodingOptions } from './encoding.ts';
import { renderVideo, resolveChunkSeconds } from './chunks.ts';
import { hardwareEncoding } from './hardware.ts';
import { cancellable } from './cancellation.ts';

export type {
  RenderStage,
  RenderProgress,
  RenderOptions,
  RenderResult,
  StillOptions,
  StillResult,
} from '@setcast/core';

export { probeAudio } from './probe.ts';
export { hardwareEncoding, type HardwareEncoding } from './hardware.ts';

export { ENTRY } from './paths.ts';
import { ENTRY, PACKAGE_ROOT } from './paths.ts';
import { currentSession, withRenderSession } from './session.ts';
export { withRenderSession } from './session.ts';

const renderInPackage = serializeInDirectory(PACKAGE_ROOT);

export function render(project: ResolvedProject, options: RenderOptions): Promise<RenderResult> {
  if (options.resume)
    throw new SetcastError(
      'Remotion does not support resumable exports.',
      'Use the browser renderer with resume, or omit the resume option.',
    );
  // Remotion keeps its browser download and webpack cache under the nearest package.json of
  // process.cwd(). Run from this package so every project shares one cache instead of each
  // project directory growing a 100 MB .remotion folder. Renders are serialized because cwd is
  // process-global.
  const resolved = {
    ...options,
    projectDir: resolve(options.projectDir),
    out: resolve(options.out),
  };
  return withRenderSession(() => renderInPackage(() => renderIn(project, resolved)));
}

async function prepare(
  project: ResolvedProject,
  options: { projectDir: string; gl?: GraphicsBackend },
  report: RenderReport,
) {
  return currentSession()
    .prepare(project, options, report)
    .catch((cause: unknown) => {
      throw translateRenderError(cause);
    });
}

async function renderIn(project: ResolvedProject, options: RenderOptions): Promise<RenderResult> {
  options.signal?.throwIfAborted();
  validateVideoFile(options.out);
  const encoding = encodingOptions(options);
  const { hardwareAcceleration } = await hardwareEncoding(encoding.hardwareAcceleration);
  const chunkSeconds = resolveChunkSeconds(options.chunkSeconds);
  const report = options.onProgress ?? (() => {});
  const { serveUrl, composition, puppeteerInstance } = await prepare(project, options, report);

  const { fps, durationInFrames } = composition;
  const frameRange: [number, number] = options.range
    ? resolveFrameRange(options.range, fps, durationInFrames)
    : [0, durationInFrames - 1];
  const totalFrames = frameRange[1] - frameRange[0] + 1;

  try {
    await renderVideo(
      {
        composition,
        serveUrl,
        puppeteerInstance,
        codec: 'h264',
        audioCodec: 'aac',
        ...encoding,
        hardwareAcceleration,
        outputLocation: options.out,
        inputProps: project,
        concurrency: options.concurrency ?? null,
        chromiumOptions: graphicsOptions(options.gl),
      },
      {
        frameRange,
        chunkSeconds,
        signal: options.signal,
        audio: project.audio ? resolve(options.projectDir, project.audio) : null,
        report,
      },
    );
  } catch (cause) {
    throw translateRenderError(cause);
  }

  return { file: options.out, frames: totalFrames, durationSeconds: totalFrames / fps };
}

const STILL_FORMATS: Record<string, 'png' | 'jpeg' | 'webp'> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
};

/** Renders a single frame as an image, for a thumbnail. */
export function still(project: ResolvedProject, options: StillOptions): Promise<StillResult> {
  return withRenderSession(() => renderInPackage(() => stillIn(project, options)));
}

async function stillIn(project: ResolvedProject, options: StillOptions): Promise<StillResult> {
  options.signal?.throwIfAborted();
  const imageFormat = stillFormat(options.out);
  const report = options.onProgress ?? (() => {});
  const { serveUrl, composition, puppeteerInstance } = await prepare(project, options, report);

  const { fps, durationInFrames } = composition;
  const at = options.at ?? defaultStillTime(project.mix);
  const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(at * fps)));

  try {
    await cancellable(options.signal, (cancelSignal) =>
      renderStill({
        cancelSignal,
        composition,
        serveUrl,
        puppeteerInstance,
        output: options.out,
        frame,
        chromiumOptions: graphicsOptions(options.gl),
        inputProps: project,
        imageFormat,
        // Remotion rejects a quality for a lossless format, so png and webp must pass none.
        jpegQuality: imageFormat === 'jpeg' ? (options.jpegQuality ?? 95) : undefined,
      }),
    );
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
  if (cause.message === 'No available ports found') {
    return new SetcastError(
      "Cannot start the renderer's local HTTP server",
      'Allow the renderer to bind a localhost port in your sandbox or firewall settings, or free an occupied port and retry.',
      { cause, exitCode: 1 },
    );
  }
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

export interface PreviewOptions extends EncodingOptions {
  /** Subscribe to project edits. Cleanup must wait for outstanding updates. */
  watch?: (update: (project: ResolvedProject) => Promise<void>) => () => Promise<void>;
  projectDir: string;
  port?: number;
  gl?: GraphicsBackend;
  jpegQuality?: number;
}

/** Opens Remotion Studio on the project. Resolves when Studio exits. */
export async function preview(project: ResolvedProject, options: PreviewOptions): Promise<void> {
  readMixDocument(project.mix);
  const { hardwareAcceleration } = await hardwareEncoding(
    encodingOptions(options).hardwareAcceleration,
  );
  const dir = await mkdtemp(join(tmpdir(), 'setcast-'));
  let stop: (() => Promise<void>) | undefined;
  try {
    const propsFile = join(dir, 'props.json');
    await writeFile(propsFile, JSON.stringify(project));
    let revision = 0;
    stop = options.watch?.(async (next) => {
      readMixDocument(next.mix);
      await writeFile(`${propsFile}.tmp`, JSON.stringify({ ...next, previewRevision: ++revision }));
      await rename(`${propsFile}.tmp`, propsFile);
    });
    await runStudio(studioArgs(propsFile, { ...options, hardwareAcceleration }));
  } finally {
    await stop?.();
    await rm(dir, { recursive: true, force: true });
  }
}

function studioArgs(propsFile: string, options: PreviewOptions): string[] {
  const args = ['studio', ENTRY, '--props', propsFile, '--public-dir', options.projectDir];
  args.push(...studioEncodingArgs(options));
  if (options.port) args.push('--port', String(options.port));
  const { gl } = graphicsOptions(options.gl);
  if (gl) args.push('--gl', gl);
  return args;
}

/**
 * Signals that stop `setcast preview`. Without a handler Node exits at once, which leaves Studio
 * running when only this process is signaled and skips removing the props on Ctrl+C.
 */
const STOP_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Studio has no programmatic API, so it runs as its own process until the user stops it. */
function runStudio(args: string[]): Promise<void> {
  const cliPackage = fileURLToPath(import.meta.resolve('@remotion/cli/package.json'));
  const bin = join(dirname(cliPackage), 'remotion-cli.js');

  return new Promise((resolve, reject) => {
    const studio = spawn(process.execPath, [bin, ...args], {
      cwd: PACKAGE_ROOT,
      stdio: 'inherit',
    });
    let stopped = false;
    const stop = (signal: NodeJS.Signals) => {
      stopped = true;
      studio.kill(signal);
    };
    const release = () => STOP_SIGNALS.forEach((signal) => process.off(signal, stop));
    STOP_SIGNALS.forEach((signal) => process.on(signal, stop));

    studio.on('exit', (code, signal) => {
      release();
      if (code === 0 || stopped) resolve();
      else reject(studioStopped(code, signal));
    });
    studio.on('error', (cause) => {
      release();
      reject(
        new SetcastError(
          'Cannot start Remotion Studio',
          'Check that the project dependencies are installed, then retry.',
          { cause, exitCode: 1 },
        ),
      );
    });
  });
}

function studioStopped(code: number | null, signal: NodeJS.Signals | null): SetcastError {
  const cause = new Error(
    signal ? `Remotion Studio terminated by ${signal}` : `Remotion Studio exited with code ${code}`,
  );
  return new SetcastError(
    signal
      ? `Remotion Studio stopped after ${signal}`
      : `Remotion Studio stopped with exit code ${code}`,
    'Check the Studio output above for the underlying error.',
    { cause, exitCode: 1 },
  );
}
