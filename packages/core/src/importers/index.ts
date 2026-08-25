import { Registry } from '../registry.ts';
import { cueImporter } from './cue.ts';
import { plainImporter, type Importer } from './plain.ts';

export const importers = new Registry<Importer>('importer');
importers.add(cueImporter);
importers.add(plainImporter);
