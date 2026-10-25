import type { RendererCapabilities } from '@setcast/core';

export const capabilities: RendererCapabilities = {
  version: 1,
  renderer: 'remotion',
  features: ['still', 'webp', 'video', 'gpu', 'hardwareEncoding'],
  stillFormats: ['png', 'jpeg', 'webp'],
  videoContainers: ['mp4', 'mov', 'mkv'],
  videoCodec: 'h264',
  audioCodec: 'aac',
  graphicsBackends: [
    'auto',
    'default',
    'angle',
    'egl',
    'swiftshader',
    'swangle',
    'vulkan',
    'angle-egl',
  ],
  parallelEncoding: [true, false],
  concurrency: { default: 'auto', min: 1, max: null },
  runtime: { browser: 'Remotion Chrome Headless Shell', ffmpeg: 'packaged' },
};
