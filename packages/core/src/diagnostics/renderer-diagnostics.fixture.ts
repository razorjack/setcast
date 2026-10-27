import type { RendererCapabilities } from './renderer-capabilities.ts';

export const fixture: RendererCapabilities = {
  version: 1,
  renderer: 'browser',
  features: ['still', 'video', 'gpu', 'resume', 'webp'],
  stillFormats: ['png', 'jpeg', 'webp'],
  videoContainers: ['mp4', 'mov', 'mkv'],
  videoCodec: 'h264',
  audioCodec: 'aac',
  graphicsBackends: ['auto'],
  parallelEncoding: [true],
  concurrency: { default: 1, min: 1, max: 8 },
  runtime: { browser: 'fixture', ffmpeg: 'system' },
};
