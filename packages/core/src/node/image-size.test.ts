import { describe, expect, test } from 'vite-plus/test';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageSize, readImageSize } from './image-size.ts';

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const be16 = (value: number) => [value >> 8, value & 0xff];
const be32 = (value: number) => [...be16(value >>> 16), ...be16(value & 0xffff)];
const le24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, value >> 16];
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

describe('imageSize', () => {
  test('reads PNG from its IHDR chunk', () => {
    const png = bytes(
      [0x89],
      ascii('PNG\r\n\x1a\n'),
      be32(13),
      ascii('IHDR'),
      be32(1192),
      be32(670),
    );
    expect(imageSize(png)).toEqual({ width: 1192, height: 670 });
  });

  test('reads JPEG from the frame header after other segments', () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...new Array<number>(14).fill(0)];
    const sof2 = [0xff, 0xc2, ...be16(17), 8, ...be16(729), ...be16(1096), 3];
    expect(imageSize(bytes([0xff, 0xd8], app0, sof2, new Array<number>(12).fill(0)))).toEqual({
      width: 1096,
      height: 729,
    });
  });

  test('reads extended WebP', () => {
    const webp = bytes(ascii('RIFF'), be32(0), ascii('WEBPVP8X'), be32(10), [0, 0, 0, 0]);
    expect(imageSize(bytes([...webp], le24(1209), le24(659)))).toEqual({
      width: 1210,
      height: 660,
    });
  });

  test('says nothing about other formats', () => {
    expect(imageSize(bytes(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(imageSize(bytes([]))).toBeNull();
  });
});

test('reads sparse JPEG headers past metadata and invalidates cached sizes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-size-'));
  const file = join(dir, 'large.jpg');
  try {
    const handle = await open(file, 'w');
    const metadata = bytes([0xff, 0xd8, 0xff, 0xe1], be16(65535));
    const offset = 2 + 2 + 65535;
    const frame = bytes([0xff, 0xc0], be16(17), [8], be16(729), be16(1096), [3]);
    await handle.write(metadata, 0, metadata.length, 0);
    await handle.write(frame, 0, frame.length, offset);
    await handle.truncate(100_000_000);
    await handle.close();
    expect(await readImageSize(file)).toEqual({ width: 1096, height: 729 });
    const changed = await open(file, 'r+');
    await changed.write(Uint8Array.from(be16(800)), 0, 2, offset + 7);
    await changed.close();
    expect(await readImageSize(file)).toEqual({ width: 800, height: 729 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
