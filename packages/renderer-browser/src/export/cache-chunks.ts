import type { ResolvedProject } from '@setcast/core';
import { digest, type ExportIdentity } from './identity.ts';
import { validateChunk } from './probe.ts';
import type { ChunkStore } from './checkpoint.ts';
import type { RenderCache } from './cache.ts';

export function cachedChunks(
  cache: RenderCache,
  identity: ExportIdentity,
  project: ResolvedProject,
): ChunkStore {
  const key = (index: number, range: [number, number]) =>
    digest(JSON.stringify({ version: 1, job: identity.key, index, range }));
  return {
    reuse: (index, range, file, signal) => cache.reuse(key(index, range), file, signal),
    async save(index, range, file, signal) {
      await validateChunk(file, { ...project, frames: range[1] - range[0] + 1 }, signal);
      await cache.save(key(index, range), file, signal);
    },
    assertInputsUnchanged: () => identity.assertInputsUnchanged(),
  };
}
