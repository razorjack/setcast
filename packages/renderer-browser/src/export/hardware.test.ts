import { expect, test, vi } from 'vite-plus/test';
import { hardwareArgs, selectHardwareEncoding } from './hardware.ts';
import { exportEncoding, videoArgs } from './encoding.ts';

test('disabled hardware never probes a device', async () => {
  const probe = vi.fn();
  expect(await selectHardwareEncoding('disable', 'darwin', probe)).toEqual({
    hardwareAcceleration: 'disable',
    encoder: 'libx264',
  });
  expect(probe).not.toHaveBeenCalled();
});

test.each([
  ['darwin', 'h264_videotoolbox'],
  ['linux', 'h264_nvenc'],
  ['win32', 'h264_nvenc'],
] as const)(
  '%s selects hardware only after a successful real-encode probe',
  async (platform, encoder) => {
    const probe = vi.fn(async () => {});
    expect(await selectHardwareEncoding('required', platform, probe)).toEqual({
      hardwareAcceleration: 'required',
      encoder,
    });
    expect(probe).toHaveBeenCalledWith(encoder);
  },
);

test('optional device failure falls back; required device failure preserves the cause', async () => {
  const cause = Object.assign(new Error('ffmpeg exited'), {
    code: 1,
    stderr: 'No usable device\nRepeated encoder error',
  });
  const probe = async () => {
    throw cause;
  };
  expect(await selectHardwareEncoding('if-possible', 'linux', probe)).toEqual({
    hardwareAcceleration: 'disable',
    encoder: 'libx264',
    fallback: 'Hardware encoding is unavailable: No usable device Encoding with libx264 instead.',
  });
  await expect(selectHardwareEncoding('required', 'linux', probe)).rejects.toMatchObject({
    message: 'Cannot start h264_nvenc: No usable device',
    cause,
    exitCode: 1,
    hint: expect.stringContaining('if-possible'),
  });
});

test('cancellation and programming failures never become software fallback', async () => {
  const controller = new AbortController();
  const cause = new Error('Cancelled');
  await expect(
    selectHardwareEncoding(
      'if-possible',
      'darwin',
      async () => {
        controller.abort(cause);
      },
      controller.signal,
    ),
  ).rejects.toBe(cause);
  await expect(
    selectHardwareEncoding('if-possible', 'darwin', async () => {
      throw new TypeError('Invalid probe');
    }),
  ).rejects.toThrow('Invalid probe');
});

test('unsupported platforms have explicit required and optional behavior', async () => {
  const probe = vi.fn();
  await expect(selectHardwareEncoding('required', 'aix', probe)).rejects.toMatchObject({
    message: expect.stringContaining('aix'),
    hint: expect.stringContaining('disable'),
  });
  expect((await selectHardwareEncoding('if-possible', 'aix', probe)).encoder).toBe('libx264');
  expect(probe).not.toHaveBeenCalled();
});

test('hardware uses explicit bitrate and never inherits x264 controls or permits VideoToolbox software fallback', () => {
  const options = {
    projectDir: '.',
    out: 'out.mp4',
    hardwareAcceleration: 'required' as const,
    videoBitrate: '12M' as const,
  };
  const encoding = exportEncoding(options);
  for (const encoder of ['h264_videotoolbox', 'h264_nvenc'] as const) {
    const args = videoArgs(30, encoding, 'out.mp4', encoder);
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', encoder]);
    expect(args).toContain('12M');
    expect(args).not.toContain('-crf');
    expect(args).not.toContain('-preset');
  }
  expect(hardwareArgs('h264_videotoolbox')).toEqual(['-allow_sw', '0']);
  const fallback = exportEncoding({ ...options, hardwareAcceleration: 'disable' });
  expect(videoArgs(30, fallback, 'out.mp4')).toContain('medium');
  expect(videoArgs(30, fallback, 'out.mp4')).toContain('12M');
});
