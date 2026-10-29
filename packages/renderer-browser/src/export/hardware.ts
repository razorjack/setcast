import { SetcastError, type HardwareAcceleration, type VideoBitrate } from '@setcast/core';
import { diagnosticCommand } from '@setcast/core/node';

export type VideoEncoder = 'libx264' | 'h264_videotoolbox' | 'h264_nvenc';
export interface HardwareProbe {
  width?: number;
  height?: number;
  fps?: number;
  videoBitrate?: VideoBitrate;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function hardwareEncoder(platform: NodeJS.Platform): VideoEncoder | null {
  if (platform === 'darwin') return 'h264_videotoolbox';
  if (platform === 'linux' || platform === 'win32') return 'h264_nvenc';
  return null;
}

export const hardwareArgs = (encoder: VideoEncoder) =>
  encoder === 'h264_videotoolbox' ? ['-allow_sw', '0'] : [];

export async function probeHardware(encoder: VideoEncoder, options: HardwareProbe = {}) {
  await diagnosticCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-f',
      'lavfi',
      '-i',
      `color=s=${options.width ?? 256}x${options.height ?? 256}:r=${options.fps ?? 30}`,
      '-frames:v',
      '1',
      '-an',
      '-c:v',
      encoder,
      ...hardwareArgs(encoder),
      '-b:v',
      options.videoBitrate ?? '1M',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'null',
      '-',
    ],
    options,
  );
}

export function resolveHardwareEncoding(
  setting: HardwareAcceleration,
  options: HardwareProbe = {},
) {
  return selectHardwareEncoding(
    setting,
    process.platform,
    (encoder) => probeHardware(encoder, options),
    options.signal,
  );
}

export async function selectHardwareEncoding(
  setting: HardwareAcceleration,
  platform: NodeJS.Platform,
  probe: (encoder: VideoEncoder) => Promise<void>,
  signal?: AbortSignal,
): Promise<{
  hardwareAcceleration: HardwareAcceleration;
  encoder: VideoEncoder;
  fallback?: string;
}> {
  signal?.throwIfAborted();
  if (setting === 'disable') return { hardwareAcceleration: 'disable', encoder: 'libx264' };
  const encoder = hardwareEncoder(platform);
  let failure = `No hardware H.264 encoder is configured for ${platform}.`;
  let failureCause: unknown;
  if (encoder) {
    try {
      await probe(encoder);
      signal?.throwIfAborted();
      return { hardwareAcceleration: setting, encoder };
    } catch (cause) {
      signal?.throwIfAborted();
      if (!(cause instanceof Error) || !('code' in cause)) throw cause;
      failureCause = cause;
      const stderr =
        'stderr' in cause && typeof cause.stderr === 'string' ? cause.stderr.trim() : '';
      failure = (stderr.split('\n')[0] || cause.message).slice(0, 2000);
    }
  }
  const hint =
    'Install FFmpeg with a usable VideoToolbox encoder on macOS or NVENC on an NVIDIA host. Use hardwareAcceleration: if-possible to allow software fallback, or disable.';
  if (setting === 'required')
    throw new SetcastError(
      `Cannot start ${encoder ?? 'hardware H.264 encoding'}: ${failure}`,
      hint,
      { cause: failureCause, exitCode: 1 },
    );
  return {
    hardwareAcceleration: 'disable',
    encoder: 'libx264',
    fallback: `Hardware encoding is unavailable: ${failure} Encoding with libx264 instead.`,
  };
}
