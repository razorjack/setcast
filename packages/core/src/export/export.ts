import type {
  ExportProfile,
  GraphicsBackend,
  HardwareAcceleration,
  OutputConfig,
  VideoBitrate,
  X264Preset,
} from '../config.ts';
import { type MixDocument } from '../mix/mix-schema.ts';
import { toSeconds } from '../time.ts';
import type { ResolvedProject } from '../project.ts';

export interface EncodingOptions {
  parallelEncoding?: boolean;
  profile?: ExportProfile;
  jpegQuality?: number;
  x264Preset?: X264Preset;
  crf?: number;
  hardwareAcceleration?: HardwareAcceleration;
  videoBitrate?: VideoBitrate;
}

export type RenderStage = 'browser' | 'bundle' | 'checkpoint' | 'frames' | 'encode';

export interface RenderProgress {
  /** `browser` reports preparation of the browser runtime. */
  stage: RenderStage;
  /** 0..1 within the stage. */
  progress: number;
  renderedFrames?: number;
  totalFrames?: number;
  reusedFrames?: number;
}

export type RenderReport = (progress: RenderProgress) => void;

/** Observations from an active export, distinct from requested configuration. */
export type RenderRuntime =
  | {
      kind: 'browser';
      userAgent: string;
      graphics: { renderer: string; vendor: string; version: string } | null;
      graphicsError: string | null;
      capture: 'jpeg-screenshot';
    }
  | { kind: 'capture'; workers: number; parallelEncoding: boolean }
  | { kind: 'encoder'; encoder: string; pipeline: 'stream' | 'image-sequence' };

export type RuntimeReport = (event: RenderRuntime) => void;

export interface RenderOptions extends EncodingOptions {
  /** Browser exporter only: retain and validate completed chunks across interrupted jobs. */
  resume?: boolean;
  signal?: AbortSignal;
  projectDir: string;
  out: string;
  /** Seconds; inclusive start, exclusive end. */
  range?: [number, number];
  concurrency?: number;
  /** Maximum seconds per render batch. Defaults to 60; 0 disables chunking. */
  chunkSeconds?: number;
  gl?: GraphicsBackend;
  onProgress?: RenderReport;
  onRuntime?: RuntimeReport;
}

export interface RenderResult {
  file: string;
  frames: number;
  durationSeconds: number;
}

export interface StillOptions {
  signal?: AbortSignal;
  projectDir: string;
  out: string;
  /** Seconds into the set. Defaults to `defaultStillTime`. */
  at?: number;
  jpegQuality?: number;
  gl?: GraphicsBackend;
  onProgress?: RenderReport;
}

export interface StillResult {
  file: string;
  /** The moment actually grabbed, after rounding to a frame and clamping to the set. */
  timeSeconds: number;
}

/** The operations acceptance checks require from an offline exporter. */
export interface Exporter {
  render(project: ResolvedProject, options: RenderOptions): Promise<RenderResult>;
  still(project: ResolvedProject, options: StillOptions): Promise<StillResult>;
  withRenderSession<T>(task: () => Promise<T>): Promise<T>;
}

/** The moment a still shows unless told otherwise: the first mix drop, or a quarter into the set. */
export function defaultStillTime(mix: MixDocument): number {
  const drop = mix.annotations.find(
    (annotation) => annotation.kind === 'drop' && annotation.scope === 'mix',
  );
  if (drop) return toSeconds(drop.at);
  return toSeconds(mix.duration) / 4;
}

/** What an exporter reads from a parsed `output:` block. */
export type ExportSettings = Pick<RenderOptions, keyof EncodingOptions | 'chunkSeconds' | 'gl'>;

export function exportSettings(output: OutputConfig): ExportSettings {
  return {
    profile: output.profile,
    crf: output.crf,
    x264Preset: output.x264Preset,
    parallelEncoding: output.parallelEncoding,
    chunkSeconds: output.chunkSeconds,
    hardwareAcceleration: output.hardwareAcceleration,
    videoBitrate: output.videoBitrate,
    jpegQuality: output.jpegQuality,
    gl: output.gl,
  };
}
