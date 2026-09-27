import type { Theme } from '@setcast/core';
import { escapement } from './escapement.ts';
import { sterileTech } from './sterile-tech.ts';

export { escapement, sterileTech };

/** Built-in themes by name, in the order `setcast init` offers them. */
export const themes: Record<string, Theme> = Object.fromEntries(
  [sterileTech, escapement].map((theme) => [theme.name, theme]),
);
