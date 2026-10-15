import type { Theme } from '@setcast/core';
import { afterhours } from './afterhours.ts';
import { anamorphic } from './anamorphic.ts';
import { bristol } from './bristol.ts';
import { bunker } from './bunker.ts';
import { darkroom } from './darkroom.ts';
import { escapement } from './escapement.ts';
import { interference } from './interference.ts';
import { longExposure } from './long-exposure.ts';
import { masthead } from './masthead.ts';
import { passePartout } from './passe-partout.ts';
import { patina } from './patina.ts';
import { pirate } from './pirate.ts';
import { quicksilver } from './quicksilver.ts';
import { relief } from './relief.ts';
import { sterileTech } from './sterile-tech.ts';
import { vfd } from './vfd.ts';

export {
  afterhours,
  anamorphic,
  bristol,
  bunker,
  darkroom,
  escapement,
  interference,
  longExposure,
  masthead,
  passePartout,
  patina,
  pirate,
  quicksilver,
  relief,
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
    passePartout,
    masthead,
    anamorphic,
    relief,
    darkroom,
  ].map((theme) => [theme.name, theme]),
);
