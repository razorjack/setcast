import {
  OutputSchema,
  SetcastError,
  type HardwareAcceleration,
  type VideoBitrate,
} from '@setcast/core';

export interface EncodingOptions {
  crf?: number;
  hardwareAcceleration?: HardwareAcceleration;
  videoBitrate?: VideoBitrate;
}

export function encodingOptions(options: EncodingOptions) {
  const parsed = OutputSchema.safeParse({
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
  const { crf, hardwareAcceleration, videoBitrate } = parsed.data;
  return { crf: crf ?? null, hardwareAcceleration, videoBitrate };
}

export function studioEncodingArgs(options: EncodingOptions): string[] {
  const { crf, hardwareAcceleration, videoBitrate } = encodingOptions(options);
  const args = ['--hardware-acceleration', hardwareAcceleration];
  if (crf !== null) args.push('--crf', String(crf));
  if (videoBitrate) args.push('--video-bitrate', videoBitrate);
  return args;
}
