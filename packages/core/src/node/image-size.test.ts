import { describe, expect, test } from 'vite-plus/test';
import { imageSize } from './image-size.ts';

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
