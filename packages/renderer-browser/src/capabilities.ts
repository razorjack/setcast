import type { RendererCapabilities } from '@setcast/core';

export const capabilities: RendererCapabilities = {
  version: 1,
  renderer: 'browser',
  features: ['still', 'webp', 'video', 'resume', 'gpu'],
  stillFormats: ['png', 'jpeg', 'webp'],
  videoContainers: ['mp4', 'mov', 'mkv'],
  videoCodec: 'h264',
  audioCodec: 'aac',
  graphicsBackends: ['auto', 'default', 'angle'],
  parallelEncoding: [true],
  concurrency: { default: 1, min: 1, max: 8 },
  runtime: { browser: 'Playwright Chromium', ffmpeg: 'system' },
};
