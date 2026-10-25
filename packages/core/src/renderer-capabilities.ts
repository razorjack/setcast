import type { GraphicsBackend } from './config.ts';

export type RendererName = 'remotion' | 'browser';
export type RendererFeature = 'still' | 'webp' | 'video' | 'resume' | 'gpu' | 'hardwareEncoding';

/** Declared Setcast support, independent of installed executables and available devices. */
export interface RendererCapabilities {
  version: 1;
  renderer: RendererName;
  features: readonly RendererFeature[];
  stillFormats: readonly ('png' | 'jpeg' | 'webp')[];
  videoContainers: readonly ('mp4' | 'mov' | 'mkv')[];
  videoCodec: 'h264';
  audioCodec: 'aac';
  graphicsBackends: readonly GraphicsBackend[];
  parallelEncoding: readonly boolean[];
  concurrency: { default: number | 'auto'; min: number; max: number | null };
  runtime: { browser: string; ffmpeg: 'system' | 'packaged' };
}
