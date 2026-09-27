import { fileURLToPath } from 'node:url';

/** Absolute path of a file shipped in this package, e.g. `packaged('bristol/theme.css')`. */
export const packaged = (path: string): string =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));
