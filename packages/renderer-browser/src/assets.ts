import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export function byteRange(header: string | undefined, size: number): [number, number] | null {
  if (!header) return size ? [0, size - 1] : null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return null;
  return [start, end];
}

export async function projectAsset(root: string, path: string): Promise<string | null> {
  const file = await realpath(resolve(root, path));
  const inside = relative(root, file);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return null;
  return file;
}

export const mediaType = (path: string): string =>
  ({
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  })[extname(path).toLowerCase()] ?? 'application/octet-stream';

export async function serveAsset(file: string, request: IncomingMessage, response: ServerResponse) {
  const info = await stat(file);
  if (!info.isFile()) {
    response.writeHead(404).end();
    return;
  }
  const range = byteRange(request.headers.range, info.size);
  if (!range) {
    response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    return;
  }
  const [start, end] = range;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', mediaType(file));
  response.setHeader('Content-Length', end - start + 1);
  if (request.headers.range)
    response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  response.writeHead(request.headers.range ? 206 : 200);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  response.on('close', () => stream.destroy());
  stream.on('error', (error) => response.destroy(error));
  stream.pipe(response);
}
