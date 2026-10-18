import type { GraphicsBackend } from '@setcast/core';
import type { ChromiumOptions } from '@remotion/renderer';

const ANGLE_PLATFORMS: NodeJS.Platform[] = ['darwin', 'linux'];

export function graphicsOptions(
  backend: GraphicsBackend = 'auto',
  platform: NodeJS.Platform = process.platform,
): ChromiumOptions {
  if (backend === 'auto') return { gl: ANGLE_PLATFORMS.includes(platform) ? 'angle' : null };
  return { gl: backend === 'default' ? null : backend };
}
