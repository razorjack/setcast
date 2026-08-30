import { resolve } from 'node:path';
import { formatTimecode, type SetEvent } from '@setcast/core';
import { loadProject, type LoadedProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { warn } from './ui.ts';

export async function load(dir = '.'): Promise<LoadedProject> {
  const loaded = await loadProject(resolve(dir), { themes });
  for (const warning of loaded.warnings) warn(warning);
  return loaded;
}

export function warnEventsAfterAudio(events: readonly SetEvent[], duration: number): void {
  for (const event of events) {
    if (event.time > duration) {
      warn(
        `${event.type} event at ${formatTimecode(event.time)} is after the audio ends at ${formatTimecode(duration)}.`,
      );
    }
  }
}
