import { SetcastError, type GraphicsBackend } from '@setcast/core';

export function captureBrowserArgs(backend: GraphicsBackend = 'auto'): string[] {
  return [
    '--force-color-profile=srgb',
    // Preserve Remotion's Linux text rasterization when replacing its offline output.
    ...(process.platform === 'linux' ? ['--font-render-hinting=none'] : []),
    // Keep asset/React readiness; remove display refresh pacing only from offline capture.
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...graphicsArgs(backend),
  ];
}

export function validateGraphicsBackend(backend: GraphicsBackend = 'auto'): void {
  if (['auto', 'default', 'angle'].includes(backend)) return;
  throw new SetcastError(
    `Browser export does not yet support output.gl: ${backend}.`,
    'Use auto, default or angle, or select --renderer remotion for the other graphics backends.',
  );
}

export function graphicsArgs(backend: GraphicsBackend = 'auto'): string[] {
  validateGraphicsBackend(backend);
  // Linux NVIDIA ANGLE fails theme pixel determinism and can stall screenshots.
  // The pinned Chromium default uses SwiftShader; keep explicit ANGLE opt-in.
  if (
    backend === 'default' ||
    (backend === 'auto' && ['linux', 'win32'].includes(process.platform))
  )
    return [];
  return ['--use-gl=angle'];
}
