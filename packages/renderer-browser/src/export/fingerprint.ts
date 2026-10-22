import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, release } from 'node:os';
import { SetcastError, type ResolvedProject, type RenderOptions } from '@setcast/core';
import { projectAsset } from '../assets.ts';
import { exportEncoding } from './encoding.ts';
import { exportRuntime } from './session.ts';
import { encoderVersion } from './probe.ts';

export const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
}

export async function digestFile(file: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`Expected a regular file at ${file}.`);
    const hash = createHash('sha256');
    for await (const bytes of handle.createReadStream({ autoClose: false })) {
      signal?.throwIfAborted();
      hash.update(bytes);
    }
    if (stamp(before) !== stamp(await handle.stat())) throw changedAsset(file);
    return { sha256: hash.digest('hex'), bytes: before.size, stamp: stamp(before) };
  } finally {
    await handle.close();
  }
}

const stamp = (info: Stats) =>
  `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const changedAsset = (file: string) =>
  new SetcastError(
    `Render input changed while exporting: ${file}.`,
    'Keep source files unchanged during export, then rerun --resume to validate the checkpoints.',
  );

export function projectAssets(project: ResolvedProject): string[] {
  const scenes = [project, ...(project.scenes ?? []).map(({ scene }) => scene)];
  for (const scene of scenes) validateCss(scene.css);
  const backgrounds = project.mix.plays.map((play) => play.background);
  return [...new Set([project.audio, ...backgrounds, ...scenes.map((scene) => scene.background)])]
    .filter((path): path is string => Boolean(path))
    .sort();
}

function validateCss(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const urls = [...source.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi)];
  if (
    /@import\b/i.test(source) ||
    urls.some((match) => !/^(data:|#)/i.test((match[2] ?? match[3] ?? '').trim()))
  )
    throw new SetcastError(
      'Resumable export requires self-contained theme CSS.',
      'Use local relative url() references, which Setcast embeds, and remove @import. Or render without --resume.',
    );
}

export async function fingerprint(
  project: ResolvedProject,
  options: RenderOptions,
  ranges: [number, number][],
) {
  const root = await realpath(options.projectDir);
  const paths = projectAssets(project);
  const encoder = await encoderVersion(options.signal);
  options.onProgress?.({ stage: 'checkpoint', progress: 0 });
  const assets: ({ path: string; file: string } & Awaited<ReturnType<typeof digestFile>>)[] = [];
  for (const path of paths) {
    const file = await projectAsset(root, path);
    if (!file)
      throw new SetcastError(
        `Resume asset leaves the project: ${path}.`,
        'Move assets inside the project directory.',
      );
    assets.push({ path, file, ...(await digestFile(file, options.signal)) });
  }
  const runtime = await exportRuntime(options);
  const identity = {
    project,
    ranges,
    encoding: exportEncoding(options),
    concurrency: options.concurrency ?? 1,
    gl: options.gl ?? 'auto',
    runtime,
    platform: process.platform,
    arch: process.arch,
    os: release(),
    host: hostname(),
    node: process.version,
    playwright: digest(await readFile(new URL(import.meta.resolve('playwright/package.json')))),
    adapter: await adapterDigest(),
    encoder,
    assets: assets.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
  };
  return {
    key: digest(canonical(identity)),
    paths: assets.map(({ path }) => path),
    async unchanged() {
      for (const asset of assets) {
        options.signal?.throwIfAborted();
        const file = await projectAsset(root, asset.path);
        if (file !== asset.file || stamp(await stat(asset.file)) !== asset.stamp)
          throw changedAsset(asset.path);
      }
    },
  };
}

async function adapterDigest() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter(
    (entry) =>
      entry.isFile() && /\.(?:mjs|js|tsx?)$/.test(entry.name) && !entry.name.includes('.test.'),
  );
  const hashes = [];
  for (const entry of files) {
    const file = join(entry.parentPath, entry.name);
    hashes.push([file.slice(root.length), (await digestFile(file)).sha256]);
  }
  return digest(canonical(hashes.sort(([a], [b]) => a!.localeCompare(b!))));
}
