import type { RenderRuntime } from '@setcast/core';

/** Input -vcodec can name the JPEG decoder; output codec options follow the final input. */
export function encodingRuntime(
  args: string[],
  type: 'pre-stitcher' | 'stitcher',
): Extract<RenderRuntime, { kind: 'encoder' }> | null {
  const lastInput = args.lastIndexOf('-i');
  const codec = args.findIndex(
    (arg, index) => index > lastInput && ['-c:v', '-vcodec', '-codec:v'].includes(arg),
  );
  const encoder = args[codec + 1];
  if (codec < 0 || !encoder || encoder === 'copy') return null;
  const beforeInput = args.slice(0, args.indexOf('-i'));
  const format = beforeInput.lastIndexOf('-f');
  return {
    kind: 'encoder',
    encoder,
    inputFormat: format < 0 ? 'auto' : beforeInput[format + 1]!,
    pipeline: type === 'pre-stitcher' ? 'stream' : 'image-sequence',
  };
}
