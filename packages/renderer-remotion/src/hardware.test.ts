import { beforeEach, expect, test, vi } from 'vite-plus/test';

const remotion = vi.hoisted(() => ({ callFf: vi.fn() }));
vi.mock('@remotion/renderer', () => ({ RenderInternals: { callFf: remotion.callFf } }));

const { hardwareEncoding } = await import('./hardware.ts');

const noDevice = Object.assign(new Error('Command failed with exit code 171'), {
  exitCode: 171,
  stderr: [
    '[h264_nvenc @ 0x557bfcb12c40] dl_fn->cuda_dl->cuInit(0) failed -> CUDA_ERROR_NO_DEVICE: no CUDA-capable device is detected',
    '[vost#0:0/h264_nvenc @ 0x557bfcb12880] Error while opening encoder',
  ].join('\n'),
});
const cause =
  'dl_fn->cuda_dl->cuInit(0) failed -> CUDA_ERROR_NO_DEVICE: no CUDA-capable device is detected';

beforeEach(() => {
  remotion.callFf.mockReset().mockResolvedValue({ exitCode: 0 });
});

test('keeps hardware encoding when the encoder opens a frame', async () => {
  await expect(hardwareEncoding('required', 'linux')).resolves.toEqual({
    hardwareAcceleration: 'required',
  });
  expect(remotion.callFf.mock.calls[0]![0].args).toEqual(
    expect.arrayContaining(['-c:v', 'h264_nvenc']),
  );
});

test('if-possible falls back to software and reports why', async () => {
  remotion.callFf.mockRejectedValue(noDevice);
  await expect(hardwareEncoding('if-possible', 'linux')).resolves.toEqual({
    hardwareAcceleration: 'disable',
    fallback: expect.stringContaining(`(h264_nvenc: ${cause}). Encoding in software instead.`),
  });
});

test('required names the encoder, the cause and the alternatives', async () => {
  remotion.callFf.mockRejectedValue(noDevice);
  await expect(hardwareEncoding('required', 'win32')).rejects.toMatchObject({
    message: `Cannot encode with h264_nvenc: ${cause}`,
    hint: expect.stringContaining('NVENC, which needs an NVIDIA GPU and its driver.'),
    exitCode: 1,
  });
});

test('disable never starts FFmpeg', async () => {
  await expect(hardwareEncoding('disable', 'linux')).resolves.toEqual({
    hardwareAcceleration: 'disable',
  });
  expect(remotion.callFf).not.toHaveBeenCalled();
});
