// Proves the renderer seam: no Remotion package may appear in the dependency graph of any
// plugin-facing package (everything except @setcast/renderer-remotion and the CLI that loads it).
// Complements the Oxlint no-restricted-imports rule in vite.config.ts. Run: vp run ban-check
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_FACING = ['packages/core', 'packages/themes'];
const isRemotion = (name: string) => name === 'remotion' || name.startsWith('@remotion/');

type Pkg = {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const read = (dir: string): Pkg => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

function walk(dir: string, seen = new Set<string>(), trail: string[] = []): string[] {
  const key = realpathSync(dir);
  if (seen.has(key)) return [];
  seen.add(key);
  const pkg = read(dir);
  const offenders: string[] = [];
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (isRemotion(dep)) {
      offenders.push([...trail, pkg.name, dep].join(' → '));
      continue;
    }
    const depDir = locate(dir, dep);
    if (!depDir) {
      if (dep.startsWith('@setcast/'))
        fail(`cannot locate ${dep} (required by ${pkg.name}); run vp install first`);
      continue;
    }
    offenders.push(...walk(depDir, seen, [...trail, pkg.name]));
  }
  return offenders;
}

/** Node-style resolution of a package directory: nearest node_modules/<name> walking up, realpath'd for pnpm. */
function locate(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

const fail = (msg: string): never => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

let failed = false;
for (const rel of PLUGIN_FACING) {
  const offenders = walk(join(root, rel));
  if (offenders.length) {
    failed = true;
    console.error(`✖ ${rel} reaches Remotion:\n  ${offenders.join('\n  ')}`);
  } else {
    console.log(`✓ ${rel}: no Remotion in its dependency graph`);
  }
}
if (failed) {
  console.error(
    '\nOnly packages/renderer-remotion may depend on Remotion. See AGENTS.md → Renderer independence.',
  );
  process.exit(1);
}
