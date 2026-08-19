import { resolve } from 'node:path';
import { loadProject, type LoadedProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';

export const load = (dir = '.'): Promise<LoadedProject> => loadProject(resolve(dir), { themes });
