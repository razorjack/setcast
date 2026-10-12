import {
  OutputSchema,
  SetcastError,
  type ExportProfile,
  type HardwareAcceleration,
  type VideoBitrate,
  type X264Preset,
} from '@setcast/core';

export interface EncodingOptions {
  profile?: ExportProfile;
  jpegQuality?: number;
  x264Preset?: X264Preset;
  crf?: number;
  hardwareAcceleration?: HardwareAcceleration;
  videoBitrate?: VideoBitrate;
}

export function encodingOptions(options: EncodingOptions) {
  const parsed = OutputSchema.safeParse({
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
    crf: crf ?? null,
    hardwareAcceleration,
    videoBitrate,
    jpegQuality,
    x264Preset: x264Preset ?? null,
  };
}

export function studioEncodingArgs(options: EncodingOptions): string[] {
  const { crf, hardwareAcceleration, videoBitrate, jpegQuality, x264Preset } =
    encodingOptions(options);
  const args = [
    '--hardware-acceleration',
    hardwareAcceleration,
    '--jpeg-quality',
    String(jpegQuality),
  ];
  if (crf !== null) args.push('--crf', String(crf));
  if (videoBitrate) args.push('--video-bitrate', videoBitrate);
  if (x264Preset) args.push('--x264-preset', x264Preset);
  return args;
}
