import type { Theme } from '@setcast/core';
import { bristol } from './bristol.ts';
import { escapement } from './escapement.ts';
import { longExposure } from './long-exposure.ts';
import { sterileTech } from './sterile-tech.ts';

export { bristol, escapement, longExposure, sterileTech };

/** Built-in themes by name, in the order `setcast init` offers them. */
export const themes: Record<string, Theme> = Object.fromEntries(
  [sterileTech, escapement, longExposure, bristol].map((theme) => [theme.name, theme]),
);
