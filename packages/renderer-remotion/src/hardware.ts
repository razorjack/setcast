import { RenderInternals } from '@remotion/renderer';
import { SetcastError, type HardwareAcceleration } from '@setcast/core';

export interface HardwareEncoding {
  hardwareAcceleration: HardwareAcceleration;
  /** Why `if-possible` fell back to software encoding, for a warning. */
  fallback?: string;
}

/** The H.264 encoder Remotion 4.0.513 selects for hardware acceleration (`get-codec-name.js`). */
function hardwareEncoder(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return 'h264_videotoolbox';
  if (platform === 'linux' || platform === 'win32') return 'h264_nvenc';
  return null;
}

/**
 * Remotion only checks that its FFmpeg build contains the hardware encoder. Where no device can
 * open it (NVENC on an AMD or Intel GPU), FFmpeg exits and Remotion crashes on an unhandled EPIPE,
 * so try the encoder on one frame before rendering.
 */
export async function hardwareEncoding(
  setting: HardwareAcceleration,
  platform: NodeJS.Platform = process.platform,
): Promise<HardwareEncoding> {
  if (setting === 'disable') return { hardwareAcceleration: setting };
  const encoder = hardwareEncoder(platform);
  const failure = encoder ? await encoderFailure(encoder) : `${platform} has no hardware encoder`;
  if (failure === null) return { hardwareAcceleration: setting };

  const name = encoder ?? 'a hardware H.264 encoder';
  if (setting === 'required') {
    throw new SetcastError(
      `Cannot encode with ${name}: ${failure}`,
      `output.hardwareAcceleration is required, but the encoder cannot start on this system.${nvencNote(encoder)} Use if-possible to fall back to software encoding, or disable.`,
      { exitCode: 1 },
    );
  }
  return {
    hardwareAcceleration: 'disable',
    fallback: `Hardware encoding is unavailable (${name}: ${failure}). Encoding in software instead.${nvencNote(encoder)}`,
  };
}

async function encoderFailure(encoder: string): Promise<string | null> {
  const args = ['-hide_banner', '-loglevel', 'error'];
  args.push('-filter_complex', 'nullsrc=s=256x256,format=yuv420p', '-frames:v', '1');
  args.push('-c:v', encoder, '-b:v', '1M', '-f', 'null', '-');
  try {
    await RenderInternals.callFf({
      bin: 'ffmpeg',
      args,
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
      cancelSignal: undefined,
    });
    return null;
  } catch (cause) {
    const exitCode = (cause as { exitCode?: unknown }).exitCode;
    if (!(cause instanceof Error) || typeof exitCode !== 'number') throw cause;
    return firstDiagnostic(cause) ?? `FFmpeg exited with code ${exitCode}`;
  }
}

/** FFmpeg's first error line names the cause; later lines repeat its consequences. */
function firstDiagnostic(failure: Error & { stderr?: unknown }): string | undefined {
  if (typeof failure.stderr !== 'string') return undefined;
  const line = failure.stderr.split('\n').find((text) => text.trim() !== '');
  return line?.replace(/^\[[^\]]*\]\s*/, '').trim();
}

function nvencNote(encoder: string | null): string {
  if (encoder !== 'h264_nvenc') return '';
  return ' On Linux and Windows, hardware encoding uses NVENC, which needs an NVIDIA GPU and its driver.';
}
