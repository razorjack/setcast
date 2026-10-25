import { SetcastError, type GraphicsBackend } from '@setcast/core';

export function captureBrowserArgs(backend: GraphicsBackend = 'auto'): string[] {
  return [
    // Keep asset/React readiness; remove display refresh pacing only from offline capture.
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...graphicsArgs(backend),
  ];
}

export function graphicsArgs(backend: GraphicsBackend = 'auto'): string[] {
  if (!['auto', 'default', 'angle'].includes(backend))
    throw new SetcastError(
      `Browser export does not yet support output.gl: ${backend}.`,
      'Use auto, default or angle, or select --renderer remotion for the other graphics backends.',
    );
  if (backend === 'default' || (backend === 'auto' && process.platform === 'win32')) return [];
  return ['--use-gl=angle'];
}
