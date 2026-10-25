import { expect, test, vi } from 'vite-plus/test';
import type { Page } from 'playwright';
import { captureWebp, isLosslessWebp } from './webp.ts';

function chunk(kind: string, bytes: number[]) {
  const data = Buffer.alloc(8 + bytes.length + (bytes.length % 2));
  data.write(kind);
  data.writeUInt32LE(bytes.length, 4);
  Buffer.from(bytes).copy(data, 8);
  return data;
}
function container(...chunks: Buffer[]) {
  const header = Buffer.from('RIFF\0\0\0\0WEBP', 'ascii');
  const data = Buffer.concat([header, ...chunks]);
  data.writeUInt32LE(data.length - 8, 4);
  return data;
}
const lossless = () => container(chunk('VP8L', [0x2f, 0, 0, 0, 0]));

test('lossless identification follows padded chunks and rejects lossy or truncated payloads', () => {
  expect(isLosslessWebp(lossless())).toBe(true);
  expect(
    isLosslessWebp(container(chunk('ICCP', [1, 2, 3]), chunk('VP8L', [0x2f, 0, 0, 0, 0]))),
  ).toBe(true);
  for (const bytes of [
    container(chunk('VP8 ', [1, 2, 3])),
    container(chunk('ICCP', [...Buffer.from('VP8L')])),
    container(chunk('VP8L', [0x2f])),
    container(chunk('VP8L', [0, 0, 0, 0, 0])),
    lossless().subarray(0, 18),
    Buffer.from('VP8L'),
  ])
    expect(isLosslessWebp(bytes)).toBe(false);
});

function fakePage(send: () => Promise<{ data: string }>, detach = async () => {}) {
  const release = vi.fn(detach);
  const page = {
    context: () => ({ newCDPSession: async () => ({ send, detach: release }) }),
  } as unknown as Page;
  return { page, release };
}

test('capture preserves bytes, closes the protocol session and refuses a lossy browser fallback', async () => {
  const bytes = lossless();
  const { page, release } = fakePage(async () => ({ data: bytes.toString('base64') }));
  expect(await captureWebp(page)).toEqual(bytes);
  expect(release).toHaveBeenCalledTimes(1);
  const lossy = fakePage(async () => ({
    data: container(chunk('VP8 ', [1, 2, 3])).toString('base64'),
  }));
  await expect(captureWebp(lossy.page)).rejects.toThrow('lossless WebP');
  expect(lossy.release).toHaveBeenCalledTimes(1);
});

test('capture timeout detaches the session and rejects the outstanding capture', async () => {
  vi.useFakeTimers();
  try {
    const pending = Promise.withResolvers<{ data: string }>();
    const { page, release } = fakePage(
      () => pending.promise,
      async () => {
        pending.reject(new Error('Session detached'));
      },
    );
    const rejected = expect(captureWebp(page, 25)).rejects.toThrow('WebP capture timed out');
    await vi.advanceTimersByTimeAsync(26);
    await rejected;
    expect(release).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
