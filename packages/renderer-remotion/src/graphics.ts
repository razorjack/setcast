import type { GraphicsBackend } from '@setcast/core';
import type { ChromiumOptions } from '@remotion/renderer';

export function graphicsOptions(
  backend: GraphicsBackend = 'auto',
  platform: NodeJS.Platform = process.platform,
): ChromiumOptions {
  if (backend === 'auto') return { gl: platform === 'darwin' ? 'angle' : null };
  return { gl: backend === 'default' ? null : backend };
}
