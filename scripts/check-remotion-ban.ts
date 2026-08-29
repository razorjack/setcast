// Proves the renderer seam: no Remotion package may appear in the dependency graph of any
// plugin-facing package (everything except @setcast/renderer-remotion and the CLI that loads it).
// Complements the Oxlint no-restricted-imports rule in vite.config.ts. Run: vp run ban-check
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_FACING = ['packages/core', 'packages/themes'];

const isRemotion = (name: string) => name === 'remotion' || name.startsWith('@remotion/');

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const readPackage = (dir: string): PackageJson =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

let failed = false;
for (const packagePath of PLUGIN_FACING) {
  const offenders = walk(join(root, packagePath));
  if (offenders.length === 0) {
    console.log(`✓ ${packagePath}: no Remotion in its dependency graph`);
    continue;
  }
  failed = true;
  console.error(`✖ ${packagePath} reaches Remotion:\n  ${offenders.join('\n  ')}`);
}
if (failed) {
  console.error(
    '\nOnly packages/renderer-remotion may depend on Remotion. See AGENTS.md → Renderer independence.',
  );
  process.exit(1);
}

/** Every path from `dir` down to a Remotion package, each written out as `a → b → remotion`. */
function walk(dir: string, seen = new Set<string>(), trail: string[] = []): string[] {
  const key = realpathSync(dir);
  if (seen.has(key)) return [];
  seen.add(key);

  const pkg = readPackage(dir);
  const offenders: string[] = [];
  for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (isRemotion(dependency)) {
      offenders.push([...trail, pkg.name, dependency].join(' → '));
      continue;
    }
    const dependencyDir = locate(dir, dependency);
    if (dependencyDir) {
      offenders.push(...walk(dependencyDir, seen, [...trail, pkg.name]));
      continue;
    }
    // A missing third-party package is a partial install of something we don't ship anyway.
    if (dependency.startsWith('@setcast/')) {
      fail(`cannot locate ${dependency} (required by ${pkg.name}); run vp install first`);
    }
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

function fail(problem: string): never {
  console.error(`✖ ${problem}`);
  process.exit(1);
}
