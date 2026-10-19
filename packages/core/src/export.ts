import type {
  ExportProfile,
  GraphicsBackend,
  HardwareAcceleration,
  VideoBitrate,
  X264Preset,
} from './config.ts';
import type { ResolvedProject } from './project.ts';

export interface EncodingOptions {
  parallelEncoding?: boolean;
  profile?: ExportProfile;
  jpegQuality?: number;
  x264Preset?: X264Preset;
  crf?: number;
  hardwareAcceleration?: HardwareAcceleration;
  videoBitrate?: VideoBitrate;
}

export type RenderStage = 'browser' | 'bundle' | 'frames' | 'encode';

export interface RenderProgress {
  /** `browser` reports preparation of the browser runtime. */
  stage: RenderStage;
  /** 0..1 within the stage. */
  progress: number;
  renderedFrames?: number;
  totalFrames?: number;
}

export type RenderReport = (progress: RenderProgress) => void;

export interface RenderOptions extends EncodingOptions {
  projectDir: string;
  out: string;
  /** Seconds; inclusive start, exclusive end. */
  range?: [number, number];
  concurrency?: number;
  /** Maximum seconds per render batch. Defaults to 60; 0 disables chunking. */
  chunkSeconds?: number;
  gl?: GraphicsBackend;
  onProgress?: RenderReport;
}

export interface RenderResult {
  file: string;
  frames: number;
  durationSeconds: number;
}

export interface StillOptions {
  projectDir: string;
  out: string;
  /** Seconds into the set. Defaults to a quarter of the way in. */
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
