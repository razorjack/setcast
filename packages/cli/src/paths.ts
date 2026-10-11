import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));

/** `out/set.mp4` → `out/set`; unlike a regex on `.`, a dot in a directory name is left alone. */
export const stem = (file: string) => file.slice(0, file.length - extname(file).length);
