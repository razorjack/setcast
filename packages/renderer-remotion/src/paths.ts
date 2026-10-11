import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTRY = fileURLToPath(new URL('../entry/index.tsx', import.meta.url));
export const PACKAGE_ROOT = dirname(dirname(ENTRY));
