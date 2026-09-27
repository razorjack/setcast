import type { Theme } from '@setcast/core';
import { sterileTech } from './sterile-tech.ts';

export { sterileTech };

/** Built-in themes by name, in the order `setcast init` offers them. */
export const themes: Record<string, Theme> = Object.fromEntries(
  [sterileTech].map((theme) => [theme.name, theme]),
);
