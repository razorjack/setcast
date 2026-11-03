import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, release } from 'node:os';
import {
  SetcastError,
  visualizerAssets,
  type ResolvedProject,
  type RenderOptions,
} from '@setcast/core';
import { projectAsset } from '../assets.ts';
import { exportEncoding } from './encoding.ts';
import { exportRuntime } from './session.ts';
import { encoderVersion } from './probe.ts';
import { announcementDependencies } from './cache-dependencies.ts';

export const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
}

export interface FileDigest {
  sha256: string;
  bytes: number;
  /** Device, inode, size and times: changes when the file is replaced or written. */
  stamp: string;
}

export async function digestFile(file: string, signal?: AbortSignal): Promise<FileDigest> {
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
    if (fileStamp(before) !== fileStamp(await handle.stat())) throw changedAsset(file);
    return { sha256: hash.digest('hex'), bytes: before.size, stamp: fileStamp(before) };
  } finally {
    await handle.close();
  }
}

export const fileStamp = (info: Stats) =>
  `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const changedAsset = (file: string) =>
  new SetcastError(
    `Render input changed while exporting: ${file}.`,
    'Keep source files unchanged during export, then rerun to validate stored chunks.',
  );

export function projectAssets(project: ResolvedProject): string[] {
  const scenes = [project, ...(project.scenes ?? []).map(({ scene }) => scene)];
  for (const scene of scenes) validateCss(scene.css);
  const backgrounds = project.mix.plays.map((play) => play.background);
  const sceneAssets = scenes.flatMap((scene) => [
    scene.background,
    scene.branding?.logo,
    ...visualizerAssets(scene).map((asset) => asset.value as string | undefined),
  ]);
  return [...new Set([project.audio, ...backgrounds, ...sceneAssets])]
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
      'Stored-chunk export requires self-contained theme CSS.',
      'Use local relative url() references, which Setcast embeds, and remove @import. Or render without --resume and --cache.',
    );
}

/** Input identities for exact resume and conservative persistent chunk reuse. */
export interface ExportIdentity {
  /** Digest of the project, settings, runtime, host and every input asset. */
  key: string;
  /** Persistent cache only: includes text displayed in this absolute inclusive frame range. */
  chunkKey(range: [number, number]): string;
  /** Project-relative assets the export reads; capture blocks everything else. */
  paths: string[];
  /** Throws a `SetcastError` when an input asset changed after the identity was computed. */
  assertInputsUnchanged(): Promise<void>;
}

interface InputAsset extends FileDigest {
  path: string;
  file: string;
}

/** Reads and hashes every input, the encoder, the browser runtime and this adapter's code. */
export async function computeExportIdentity(
  project: ResolvedProject,
  options: RenderOptions,
  ranges: [number, number][],
): Promise<ExportIdentity> {
  const root = await realpath(options.projectDir);
  const paths = projectAssets(project);
  const encoder = await encoderVersion(options.signal);
  const assets = await digestAssets(root, paths, options.signal);
  const identity = {
    project,
    ranges,
    encoding: exportEncoding(options),
    concurrency: options.concurrency ?? 1,
    gl: options.gl ?? 'auto',
    runtime: await exportRuntime(project, options),
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
  const key = digest(canonical(identity));
  const local = announcementDependencies(project);
  const base = local
    ? digest(canonical({ ...identity, project: { ...project, announcements: local.metadata } }))
    : key;
  return {
    key,
    chunkKey: (range) =>
      local ? digest(canonical({ base, range, texts: local.texts(range) })) : key,
    paths: assets.map(({ path }) => path),
    assertInputsUnchanged: () => assertAssetsUnchanged(root, assets, options.signal),
  };
}

async function digestAssets(root: string, paths: string[], signal?: AbortSignal) {
  const assets: InputAsset[] = [];
  for (const path of paths) {
    const file = await projectAsset(root, path);
    if (!file)
      throw new SetcastError(
        `Stored-chunk asset leaves the project: ${path}.`,
        'Move assets inside the project directory.',
      );
    assets.push({ path, file, ...(await digestFile(file, signal)) });
  }
  return assets;
}

async function assertAssetsUnchanged(root: string, assets: InputAsset[], signal?: AbortSignal) {
  for (const asset of assets) {
    signal?.throwIfAborted();
    const file = await projectAsset(root, asset.path);
    if (file !== asset.file || fileStamp(await stat(asset.file)) !== asset.stamp)
      throw changedAsset(asset.path);
  }
}

async function adapterDigest() {
  return sourceTreeDigest(fileURLToPath(new URL('../', import.meta.url)));
}

export async function sourceTreeDigest(root: string) {
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
