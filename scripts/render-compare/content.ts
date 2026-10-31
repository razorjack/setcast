import { resolve } from 'node:path';
import type { ResolvedProject } from '../../packages/core/src/index.ts';
import {
  canonical,
  digest,
  digestFile,
  projectAssets,
} from '../../packages/renderer-browser/src/export/identity.ts';

/** Same resolved scene and asset bytes, independent of capture/encoding settings and runtime. */
export async function projectContent(
  project: ResolvedProject,
  projectDir: string,
  signal?: AbortSignal,
) {
  const assets = [];
  for (const path of projectAssets(project)) {
    const { sha256, bytes } = await digestFile(resolve(projectDir, path), signal);
    assets.push({ path, sha256, bytes });
  }
  return { projectDigest: digest(canonical(project)), assetsDigest: digest(canonical(assets)) };
}
