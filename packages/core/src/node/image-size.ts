import { open, type FileHandle } from 'node:fs/promises';
import type { Size } from '../background.ts';

const sizes = new Map<string, { revision: string; size: Size | null }>();

/** Reads only image headers; JPEG metadata segments are skipped without buffering their bodies. */
export async function readImageSize(file: string): Promise<Size | null> {
  const handle = await open(file);
  try {
    const stat = await handle.stat({ bigint: true });
    const revision = `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const cached = sizes.get(file);
    if (cached?.revision === revision) return cached.size;
    const header = await readHeader(handle, 0, 32);
    const size =
      header[0] === 0xff && header[1] === 0xd8
        ? await jpegFileSize(handle, Number(stat.size))
        : imageSize(header);
    sizes.delete(file);
    sizes.set(file, { revision, size });
    if (sizes.size > 128) sizes.delete(sizes.keys().next().value!);
    return size;
  } finally {
    await handle.close();
  }
}

async function readHeader(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await handle.read(bytes, 0, length, offset);
  return bytes.subarray(0, bytesRead);
}

async function jpegFileSize(handle: FileHandle, length: number): Promise<Size | null> {
  for (let offset = 2; offset + 4 <= length;) {
    const header = await readHeader(handle, offset, 10);
    if (header[0] !== 0xff) return null;
    const marker = header[1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    if (isFrameHeader(marker) && header.length >= 9) {
      return { width: header.readUInt16BE(7), height: header.readUInt16BE(5) };
    }
    const segmentLength = header.readUInt16BE(2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/** Reads the size from the file header; null when the bytes are not a PNG, JPEG or WebP. */
export function imageSize(bytes: Uint8Array): Size | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return pngSize(bytes, view) ?? jpegSize(bytes, view) ?? webpSize(bytes, view);
}

function pngSize(bytes: Uint8Array, view: DataView): Size | null {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== 'PNG' || ascii(bytes, 12, 4) !== 'IHDR') {
    return null;
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Walks the segments before the image data to the frame header (SOF0-SOF15). */
function jpegSize(bytes: Uint8Array, view: DataView): Size | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (isFrameHeader(marker)) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/** SOF markers, but not DHT (C4), JPG (C8) or DAC (CC), which share the range. */
const isFrameHeader = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function webpSize(bytes: Uint8Array, view: DataView): Size | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8 ') {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: uint24(view, 24) + 1, height: uint24(view, 27) + 1 };
  }
  return null;
}

const uint24 = (view: DataView, offset: number) =>
  view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));
