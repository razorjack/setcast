import { Registry } from '../registry.ts';
import { plainImporter, type Importer } from './plain.ts';

export const importers = new Registry<Importer>('importer');
importers.add(plainImporter);
