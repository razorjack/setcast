import { OutputSchema, SetcastError, type EncodingOptions } from '@setcast/core';
export type { EncodingOptions } from '@setcast/core';

export function encodingOptions(options: EncodingOptions) {
  const parsed = OutputSchema.safeParse({
    parallelEncoding: options.parallelEncoding,
    profile: options.profile,
    jpegQuality: options.jpegQuality,
    x264Preset: options.x264Preset,
    crf: options.crf,
    hardwareAcceleration: options.hardwareAcceleration,
    videoBitrate: options.videoBitrate,
  });
  if (!parsed.success) {
    throw new SetcastError(
      'Invalid video encoding settings',
      parsed.error.issues.map((issue) => issue.message).join(' '),
      { cause: parsed.error },
    );
  }
  const { crf, hardwareAcceleration, videoBitrate, jpegQuality, x264Preset } = parsed.data;
  return {
    disallowParallelEncoding: !parsed.data.parallelEncoding,
    crf: crf ?? null,
    hardwareAcceleration,
    videoBitrate,
    jpegQuality,
    x264Preset: x264Preset ?? null,
  };
}

export function studioEncodingArgs(options: EncodingOptions): string[] {
  const {
    crf,
    hardwareAcceleration,
    videoBitrate,
    jpegQuality,
    x264Preset,
    disallowParallelEncoding,
  } = encodingOptions(options);
  const args = [
    '--hardware-acceleration',
    hardwareAcceleration,
    '--jpeg-quality',
    String(jpegQuality),
  ];
  if (disallowParallelEncoding) args.push('--disallow-parallel-encoding');
  if (crf !== null) args.push('--crf', String(crf));
  if (videoBitrate) args.push('--video-bitrate', videoBitrate);
  if (x264Preset) args.push('--x264-preset', x264Preset);
  return args;
}
