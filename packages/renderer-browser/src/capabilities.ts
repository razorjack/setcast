import type { RendererCapabilities } from '@setcast/core';

export const capabilities: RendererCapabilities = {
  version: 1,
  renderer: 'browser',
  features: [
    'still',
    'webp',
    'video',
    'resume',
    'cache',
    'gpu',
    'hardwareEncoding',
    'alpha',
    'prores',
  ],
  stillFormats: ['png', 'jpeg', 'webp'],
  videoContainers: ['mp4', 'mov', 'mkv'],
  videoCodec: 'h264',
  audioCodec: 'aac',
  videoFormats: [
    { codec: 'h264', containers: ['mp4', 'mov', 'mkv'], audioCodec: 'aac', alpha: false },
    { codec: 'prores-4444', containers: ['mov'], audioCodec: 'pcm_s24le', alpha: true },
  ],
  graphicsBackends: ['auto', 'default', 'angle'],
  parallelEncoding: [true],
  concurrency: { default: 'auto', min: 1, max: 8 },
  runtime: { browser: 'Playwright Chromium', ffmpeg: 'system' },
};
