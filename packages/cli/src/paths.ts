import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatFileTime } from '@setcast/core';

export const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));

/** `out/set.mp4` → `out/set`; unlike a regex on `.`, a dot in a directory name is left alone. */
export const stem = (file: string) => file.slice(0, file.length - extname(file).length);

/** `out/set.mp4` → `out/set.1m00s-1m30s.mp4`, for a render of a slice. */
export const rangeName = (file: string, [start, end]: [number, number]) =>
  `${stem(file)}.${formatFileTime(start)}-${formatFileTime(end)}${extname(file)}`;
