import type { Theme } from '@setcast/core';
import { escapement } from './escapement.ts';
import { longExposure } from './long-exposure.ts';
import { sterileTech } from './sterile-tech.ts';

export { escapement, longExposure, sterileTech };

/** Built-in themes by name, in the order `setcast init` offers them. */
export const themes: Record<string, Theme> = Object.fromEntries(
  [sterileTech, escapement, longExposure].map((theme) => [theme.name, theme]),
);
