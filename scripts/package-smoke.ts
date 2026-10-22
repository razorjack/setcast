import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, parseArgs } from 'node:util';
const { values } = parseArgs({ options: { browser: { type: 'boolean', default: false } } });

const BRANDING_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="200" height="200"><circle cx="5" cy="5" r="4" fill="#fff"/></svg>';
const BRANDING = `branding:
  logo: logo.svg
  name: Package Smoke
  messages: { lines: [instagram.com/setcast], gap: 0.5, seconds: 3 }
announcements:
  - { at: 0.1, text: Installed, seconds: 2 }
`;

const execute = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const names = ['core', 'themes', 'renderer-remotion', 'renderer-browser', 'cli'];
await requirePnpm();
const temporary = await mkdtemp(join(tmpdir(), 'setcast-packages-'));
const modules = join(temporary, 'node_modules');

const playerSmokeSource = `import assert from 'node:assert/strict';
import { play } from '@setcast/renderer-browser';
import { preview } from '@setcast/renderer-browser/preview';
import { loadProject, loadLiveProject, probeAudio } from '@setcast/core/node';
import { themes } from '@setcast/themes';

const projectDir = process.argv[2];
const { project } = await loadProject(projectDir, {
  themes, probeDuration: (audio, root) => probeAudio({ audio }, root)
});
const server = await play(project, { projectDir, port: 0 });
try {
  for (const path of ['', 'player.js', 'player.css', 'project.json', 'capture-worklet.js']) {
    const response = await fetch(new URL(path, server.url));
    assert.equal(response.status, 200, path);
    assert((await response.text()).length > 0, path);
  }
  const audio = await fetch(new URL('assets/' + project.audio, server.url), {
    headers: { Range: 'bytes=0-15' }
  });
  assert.equal(audio.status, 206);
  assert.equal((await audio.arrayBuffer()).byteLength, 16);
} finally {
  await server.close();
}
const inspection = await preview(project, { projectDir, port: 0 });
try {
  for (const path of ['', 'player.js', 'frame.html', 'frame/player.js', 'frame/player.css', 'preview.json']) {
    const response = await fetch(new URL(path, inspection.url));
    assert.equal(response.status, 200, path);
    assert((await response.text()).length > 0, path);
  }
} finally { await inspection.close(); }
const live = await loadLiveProject(projectDir, { themes, theme: 'relief' });
const liveServer = await play(live.project, { projectDir, port: 0 });
try {
  const response = await fetch(new URL('project.json', liveServer.url));
  const project = await response.json();
  assert.equal(project.mix, null);
  assert.equal(project.audio, null);
  assert.equal(project.panel, null);
  assert.equal(project.live.clock, false);
  const worklet = await fetch(new URL('capture-worklet.js', liveServer.url));
  assert.equal(worklet.status, 200);
  assert((await worklet.text()).includes('setcast-capture'));
} finally {
  await liveServer.close();
}
`;

try {
  await buildAndPack();
  await extractPackages();
  await reuseBrowser();
  await exerciseCli();
  console.log('package-smoke: PASS (packed CLI, browser player, all themes, H.264 + AAC)');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

/** `vp` installs with pnpm but cannot run `pnpm pack`, so pnpm itself must be on PATH. */
async function requirePnpm(): Promise<void> {
  if (spawnSync('pnpm', ['--version'], { stdio: 'ignore' }).status === 0) return;
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const { version } = manifest.devEngines.packageManager;
  console.error(
    `package-smoke: FAIL – pnpm is not on PATH. It packs the workspace packages. Install pnpm ${version} (for example \`mise use -g pnpm@${version}\` or \`npm install -g pnpm@${version}\`), then run vp run package-smoke again.`,
  );
  process.exit(1);
}

async function command(file: string, args: string[], cwd = root) {
  try {
    return await execute(file, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    console.error(result.stdout ?? '', result.stderr ?? '');
    throw error;
  }
}

async function buildAndPack(): Promise<void> {
  await Promise.all(
    names.map((name) =>
      command(join(root, 'node_modules/.bin/vp'), ['pack'], join(root, 'packages', name)),
    ),
  );
  await command('pnpm', ['--filter', '@setcast/*', '-r', 'pack', '--pack-destination', temporary]);
}

interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bin?: { setcast: string };
}

/** Only Setcast tarballs are copied. Third-party runtime dependencies reuse the installed versions. */
async function extractPackages(): Promise<void> {
  for (const name of names) {
    const source = join(root, 'packages', name);
    const manifest: Manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    const target = join(modules, '@setcast', name);
    await mkdir(target, { recursive: true });
    await command('tar', [
      '-xzf',
      join(temporary, `setcast-${name}-${manifest.version}.tgz`),
      '--strip-components=1',
      '-C',
      target,
    ]);
    assert(!existsSync(join(target, 'src')), 'Package smoke must not have workspace source files');
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      if (dependency.startsWith('@setcast/')) continue;
      const link = join(modules, dependency);
      if (existsSync(link)) continue;
      await mkdir(dirname(link), { recursive: true });
      await symlink(await realpath(join(source, 'node_modules', dependency)), link);
    }
  }
}

async function reuseBrowser(): Promise<void> {
  const installed = join(root, 'packages/renderer-remotion/node_modules/.remotion');
  if (!existsSync(installed)) return;
  const target = join(modules, '@setcast/renderer-remotion/node_modules');
  await mkdir(target, { recursive: true });
  await symlink(installed, join(target, '.remotion'));
}

async function exerciseCli(): Promise<void> {
  const cliPackage = join(modules, '@setcast/cli');
  const manifest: Manifest = JSON.parse(await readFile(join(cliPackage, 'package.json'), 'utf8'));
  assert(manifest.bin?.setcast);
  const cli = join(cliPackage, manifest.bin.setcast);
  assert((await readFile(cli, 'utf8')).startsWith('#!/usr/bin/env node'));
  const run = (...args: string[]) => command(process.execPath, [cli, ...args], temporary);
  assert.equal((await run('--version')).stdout.trim(), manifest.version);
  const project = join(temporary, 'project');
  await run('init', project, '--demo', '--yes');
  const configFile = join(project, 'setcast.yaml');
  const config = (await readFile(configFile, 'utf8'))
    .replace('width: 1920', 'width: 640')
    .replace('height: 1080', 'height: 360');
  await writeFile(join(project, 'logo.svg'), BRANDING_LOGO);
  await writeFile(configFile, `${config}\n${BRANDING}`);
  const inspected = JSON.parse((await run('inspect', project, '--json')).stdout);
  assert(inspected.plays.length > 0);
  await run('still', project, '--theme', 'all', '--at', '1', '--out', join(temporary, 'theme.jpg'));
  assert((await stat(join(temporary, 'theme-sterile-tech.jpg'))).size > 0);
  const video = join(temporary, 'render.mp4');
  await run('render', project, '--range', '0-0.2', '--out', video, '--concurrency', '1');
  const bytes = (await readFile(video)).toString('latin1');
  for (const box of ['ftyp', 'moov', 'avc1', 'mp4a']) assert(bytes.includes(box), `Missing ${box}`);
  assert((await run('play', '--help')).stdout.includes('setcast play'));
  await exercisePlayer(project);
  if (values.browser) await exerciseBrowser(run, project);
}

async function exercisePlayer(projectDir: string): Promise<void> {
  const script = join(temporary, 'player-smoke.mjs');
  await writeFile(script, playerSmokeSource);
  await command(process.execPath, [script, projectDir], temporary);
}

async function exerciseBrowser(
  run: (...args: string[]) => Promise<{ stdout: string }>,
  project: string,
) {
  assert((await run('browser-install', '--help')).stdout.includes('pinned Chromium'));
  await run('browser-install');
  const still = join(temporary, 'browser.png');
  await run('still', project, '--renderer', 'browser', '--at', '1', '--out', still);
  assert((await stat(still)).size > 0);
  const video = join(temporary, 'browser.mp4');
  await run(
    'render',
    project,
    '--renderer',
    'browser',
    '--resume',
    '--range',
    '0-0.2',
    '--out',
    video,
  );
  assert(!existsSync(`${video}.setcast-resume`), 'Successful resume export left checkpoints');
  const bytes = (await readFile(video)).toString('latin1');
  for (const box of ['ftyp', 'moov', 'avc1', 'mp4a']) assert(bytes.includes(box), `Missing ${box}`);
  console.log('  installed browser exporter: PNG and H.264 + AAC');
}
