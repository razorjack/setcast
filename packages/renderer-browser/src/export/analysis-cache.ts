import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { hostname, release, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  drawsWholeSet,
  readsTravel,
  SetcastError,
  type RenderOptions,
  type ResolvedProject,
} from '@setcast/core';
import { readsWholeSet, readWholeSet } from '@setcast/core/node';
import { canonical, digest, digestFile, fileStamp, sourceTreeDigest } from './identity.ts';
import { DEFAULT_CACHE_BYTES, withRenderCache, type RenderCache } from './cache.ts';
import { encoderVersion } from './probe.ts';

const MAX_PREPARED_BYTES = 64 * 1024 * 1024;
type Prepared = Pick<ResolvedProject, 'envelope' | 'travel'>;
interface PreparationOptions {
  projectDir: string;
  cache: NonNullable<RenderOptions['cache']>;
  onPreparation?: (status: 'reused' | 'computed') => void;
}

/** Persistent summaries share the video cache's lock, byte budget, eviction and clearing. */
export async function prepareProject(project: ResolvedProject, options: PreparationOptions) {
  if (!readsWholeSet(project)) return project;
  const { directory, maxBytes = DEFAULT_CACHE_BYTES } = options.cache;
  return withRenderCache(directory, maxBytes, async (cache) => {
    const temporary = await mkdtemp(join(tmpdir(), 'setcast-prepared-'));
    try {
      return await prepareCached(project, options, cache, join(temporary, 'analysis.json'));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}

async function prepareCached(
  project: ResolvedProject,
  options: PreparationOptions,
  cache: RenderCache,
  temporary: string,
) {
  const source = await realpath(join(options.projectDir, project.audio));
  const before = await digestFile(source);
  const key = await preparationKey(project, source, before.sha256);
  const reused = await readPrepared(cache, key, temporary, project);
  const prepared =
    reused ?? (await readWholeSet({ ...project, audio: basename(source) }, dirname(source)));
  const after = await stat(source);
  if (
    before.stamp !== fileStamp(after) ||
    (await realpath(join(options.projectDir, project.audio))) !== source
  )
    throw new SetcastError(
      `Audio changed while preparing ${source}.`,
      'Keep the source unchanged during export, then retry.',
    );
  if (!reused) {
    const text = JSON.stringify({
      version: 1,
      envelope: prepared.envelope,
      travel: prepared.travel,
    });
    if (Buffer.byteLength(text) <= MAX_PREPARED_BYTES) {
      await writeFile(temporary, text);
      await cache.save(key, temporary, undefined, 'analysis');
    }
  }
  options.onPreparation?.(reused ? 'reused' : 'computed');
  return { ...project, envelope: prepared.envelope, travel: prepared.travel };
}

async function preparationKey(project: ResolvedProject, source: string, sha256: string) {
  const core = fileURLToPath(new URL('../', import.meta.resolve('@setcast/core/node')));
  return digest(
    canonical({
      kind: 'whole-set-analysis',
      version: 1,
      sha256,
      extension: extname(source).toLowerCase(),
      envelope: drawsWholeSet(project),
      travel: readsTravel(project),
      core: await sourceTreeDigest(core),
      producer: (await digestFile(fileURLToPath(import.meta.url))).sha256,
      decoder: await encoderVersion(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      os: release(),
      host: hostname(),
    }),
  );
}

async function readPrepared(
  cache: RenderCache,
  key: string,
  temporary: string,
  project: ResolvedProject,
): Promise<Prepared | null> {
  if (!(await cache.reuse(key, temporary, undefined, MAX_PREPARED_BYTES))) return null;
  const text = await readFile(temporary, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  return validPrepared(value, project) ? value : null;
}

function validPrepared(value: unknown, project: ResolvedProject): value is Prepared {
  if (!value || typeof value !== 'object') return false;
  const data = value as Prepared & { version?: number };
  return (
    data.version === 1 &&
    validSummary(data.envelope, drawsWholeSet(project), 1) &&
    validSummary(data.travel, readsTravel(project), Number.MAX_VALUE)
  );
}

function validSummary(value: unknown, required: boolean, maximum: number) {
  if (!required) return value === null;
  if (!value || typeof value !== 'object') return false;
  const summary = value as NonNullable<Prepared['envelope']>;
  if (
    !Number.isFinite(summary.step) ||
    summary.step <= 0 ||
    !Array.isArray(summary.bass) ||
    !Array.isArray(summary.high) ||
    summary.bass.length !== summary.high.length
  )
    return false;
  return [summary.bass, summary.high].every((values) =>
    values.every((number) => Number.isFinite(number) && number >= 0 && number <= maximum),
  );
}
