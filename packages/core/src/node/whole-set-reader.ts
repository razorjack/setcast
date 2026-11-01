import { realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { summarizeEnvelope, travelOf } from '../audio/analysis.ts';
import { SetcastError } from '../errors.ts';
import type { ResolvedProject } from '../project.ts';
import { readsTravel } from '../stage.ts';
import { drawsWholeSet } from '../visualizers.ts';
import { readSetEnergy, readsWholeSet } from './audio.ts';

interface PreparedAudio {
  envelope: NonNullable<ResolvedProject['envelope']>;
  travel: NonNullable<ResolvedProject['travel']>;
}

/** One command or preview owns one reader; only its latest source's summaries are retained. */
export class WholeSetReader {
  private current?: { file: string; revision: string; prepared: Promise<PreparedAudio> };

  async read(project: ResolvedProject, projectDir: string): Promise<ResolvedProject> {
    if (!readsWholeSet(project)) return project;
    const file = await realpath(join(projectDir, project.audio));
    const revision = await fileRevision(file);
    if (this.current?.file !== file || this.current.revision !== revision) {
      const entry = { file, revision, prepared: prepare(file, revision) };
      this.current = entry;
      void entry.prepared.catch(() => {
        if (this.current === entry) this.current = undefined;
      });
    }
    const prepared = await this.current.prepared;
    return {
      ...project,
      envelope: drawsWholeSet(project) ? structuredClone(prepared.envelope) : null,
      travel: readsTravel(project) ? structuredClone(prepared.travel) : null,
    };
  }
}

async function prepare(file: string, revision: string): Promise<PreparedAudio> {
  const energy = await readSetEnergy(file);
  if ((await fileRevision(file)) !== revision)
    throw new SetcastError(
      `Audio changed while preparing ${file}.`,
      'Wait for the audio file to finish writing, then reload the project.',
    );
  return { envelope: summarizeEnvelope(energy), travel: travelOf(energy) };
}

async function fileRevision(file: string): Promise<string> {
  const source = await stat(file, { bigint: true });
  return `${source.dev}:${source.ino}:${source.size}:${source.mtimeNs}:${source.ctimeNs}`;
}
