import type { Page } from 'playwright';
import { SetcastError } from '@setcast/core';

/** The pinned Chromium encodes quality 100 as VP8L. Reject a future lossy fallback explicitly. */
export async function captureWebp(page: Page, timeoutMs = 30_000): Promise<Buffer> {
  const session = await page.context().newCDPSession(page);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void session.detach().catch(() => {});
  }, timeoutMs);
  try {
    const result = await session.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 100,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    if (timedOut) throw new Error('Capture deadline expired.');
    const bytes = Buffer.from(result.data, 'base64');
    if (!isLosslessWebp(bytes))
      throw new SetcastError(
        'Chromium did not produce a lossless WebP screenshot.',
        'Use PNG or reinstall the pinned browser with setcast browser-install.',
        { exitCode: 1 },
      );
    return bytes;
  } catch (cause) {
    if (timedOut)
      throw new SetcastError(
        'WebP capture timed out.',
        'Retry with less GPU load or use a smaller output resolution.',
        { cause, exitCode: 1 },
      );
    throw cause;
  } finally {
    clearTimeout(timer);
    await session.detach().catch(() => {});
  }
}

export function isLosslessWebp(bytes: Buffer): boolean {
  if (
    bytes.length < 20 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  )
    return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) return false;
    const kind = bytes.toString('ascii', offset, offset + 4);
    if (kind === 'VP8L') return size >= 5 && bytes[offset + 8] === 0x2f;
    if (kind === 'VP8 ') return false;
    offset += 8 + size + (size % 2);
  }
  return false;
}
