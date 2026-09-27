import type { Theme } from '@setcast/core';
import { afterhours } from './afterhours.ts';
import { bristol } from './bristol.ts';
import { bunker } from './bunker.ts';
import { escapement } from './escapement.ts';
import { interference } from './interference.ts';
import { longExposure } from './long-exposure.ts';
import { patina } from './patina.ts';
import { pirate } from './pirate.ts';
import { quicksilver } from './quicksilver.ts';
import { sterileTech } from './sterile-tech.ts';
import { vfd } from './vfd.ts';

export {
  afterhours,
  bristol,
  bunker,
  escapement,
  interference,
  longExposure,
  patina,
  pirate,
  quicksilver,
  sterileTech,
  vfd,
};

/** Built-in themes by name, in the order `setcast init` offers them. */
export const themes: Record<string, Theme> = Object.fromEntries(
  [
    sterileTech,
    escapement,
    longExposure,
    bristol,
    patina,
    quicksilver,
    bunker,
    vfd,
    interference,
    pirate,
    afterhours,
  ].map((theme) => [theme.name, theme]),
);
