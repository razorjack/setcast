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

const previewExportSmokeSource = String.raw`import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { preview } from '@setcast/renderer-browser/preview';
import { loadProject, probeAudio } from '@setcast/core/node';
import { themes } from '@setcast/themes';
const projectDir = process.argv[2];
const { project } = await loadProject(projectDir, { themes, probeDuration: (audio, root) => probeAudio({ audio }, root) });
const directory = join(projectDir, 'out', 'preview');
const server = await preview(project, { projectDir, port: 0, exports: { directory } });
try {
  const url = new URL('exports', server.url);
  const initial = await (await fetch(url)).json();
  assert.equal(initial.jobs.length, 0);
  const response = await fetch(url, { method: 'POST', headers: { Origin: url.origin, 'Content-Type': 'application/json', 'X-Setcast-Export': initial.token }, body: JSON.stringify({ revision: 0, first: 0, last: 5 }) });
  assert.equal(response.status, 200);
  const job = await response.json();
  let finished;
  for (let attempt = 0; attempt < 600; attempt++) {
    const state = await (await fetch(url)).json();
    finished = state.jobs.find(entry => entry.id === job.id);
    if (finished.status === 'complete' || finished.status === 'failed') break;
    await setTimeout(100);
  }
  assert.equal(finished.status, 'complete', JSON.stringify(finished));
  const file = join(directory, finished.filename);
  const bytes = await readFile(file);
  const downloaded = await fetch(new URL('exports/' + job.id + '/file', server.url));
  assert(bytes.equals(Buffer.from(await downloaded.arrayBuffer())));
  const decoded = execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' });
  assert.equal(decoded.split('\n').filter(line => line && !line.startsWith('#')).length, 6);
  console.log('  installed preview exporter: six decoded frames and completed-job download');
} finally { await server.close(); }
`;

const playerSmokeSource = `import assert from 'node:assert/strict';
import { play } from '@setcast/renderer-browser';
import { preview } from '@setcast/renderer-browser/preview';
import { GpuCanvasConfigSchema, MidiProfileSchema, MidiControlBuffer, midiMessage } from '@setcast/core';
import { ShaderCanvas } from '@setcast/core/react';
import { loadProject, loadLiveProject, probeAudio } from '@setcast/core/node';
import { themes } from '@setcast/themes';

assert.deepEqual(GpuCanvasConfigSchema.parse({}), { resolution: 0.5, recoverySeconds: 5 });
assert.equal(typeof ShaderCanvas, 'function');
const profile = MidiProfileSchema.parse({ version: 1, mapping: { 'cc:1:7': 'brightness' } });
const controls = new MidiControlBuffer();
controls.push(midiMessage([0xb0, 7, 127]), profile.mapping);
assert.deepEqual(controls.flush(profile.mapping), [{ action: 'brightness', value: 1 }]);
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
  await exerciseTooling(run);
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
  const validated = JSON.parse((await run('validate', project, '--json')).stdout);
  assert.equal(validated.valid, true);
  assert.deepEqual(validated.renderer, { name: 'remotion', checked: true });
  const browserValidation = JSON.parse(
    (await run('validate', project, '--renderer', 'browser', '--json')).stdout,
  );
  assert.equal(browserValidation.valid, true);
  assert.deepEqual(browserValidation.renderer, { name: 'browser', checked: true });
  assert.equal(validated.documents[0].summary.width, 640);
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

async function exerciseTooling(run: (...args: string[]) => Promise<{ stdout: string }>) {
  for (const renderer of ['remotion', 'browser']) {
    const capabilities = JSON.parse(
      (await run('capabilities', '--renderer', renderer, '--json')).stdout,
    );
    assert.equal(capabilities.version, 1);
    assert.equal(capabilities.renderer, renderer);
    assert(capabilities.features.includes('video'));
  }
  const doctor = JSON.parse((await run('doctor', '--renderer', 'remotion', '--json')).stdout);
  assert.equal(doctor.version, 1);
  assert.equal(doctor.ready, true);
  assert.equal(doctor.features.video, 'ready');
  const schema = JSON.parse((await run('schema', 'live')).stdout);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert(schema.properties.visualizer.anyOf.length > 0);
  assert.equal(JSON.parse((await run('schema', 'midi')).stdout).properties.version.const, 1);
}

async function exercisePlayer(projectDir: string): Promise<void> {
  const script = join(temporary, 'player-smoke.mjs');
  await writeFile(script, playerSmokeSource);
  await command(process.execPath, [script, projectDir], temporary);
}

async function exerciseBrowser(
  run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>,
  project: string,
) {
  assert((await run('browser-install', '--help')).stdout.includes('pinned Chromium'));
  await run('browser-install');
  const doctor = JSON.parse(
    (
      await run(
        'doctor',
        '--renderer',
        'browser',
        '--require',
        'still,webp,video,resume,cache',
        '--json',
      )
    ).stdout,
  );
  assert.equal(doctor.ready, true);
  assert.equal(doctor.features.resume, 'ready');
  assert.equal(doctor.features.cache, 'ready');
  for (const extension of ['png', 'webp']) {
    const still = join(temporary, `browser.${extension}`);
    await run('still', project, '--renderer', 'browser', '--at', '1', '--out', still);
    assert((await stat(still)).size > 0);
  }
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
  await exerciseCache(run, project);
  await exercisePreviewExport(project);
  console.log('  installed browser exporter: PNG, lossless WebP and H.264 + AAC');
}

async function exerciseCache(
  run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>,
  project: string,
) {
  const cache = join(temporary, 'render-cache');
  const first = join(temporary, 'cached-first.mp4');
  const second = join(temporary, 'cached-second.mp4');
  const args = ['render', project, '--renderer', 'browser', '--range', '0-0.2', '--cache', cache];
  await run(...args, '--out', first);
  const repeated = await run(...args, '--out', second);
  assert(
    repeated.stderr.includes('6 reused, 0 newly rendered'),
    'Installed cache did not skip capture',
  );
  const before = JSON.parse((await run('cache', 'inspect', cache, '--json')).stdout);
  assert.equal(before.entries.length, 1);
  assert(before.bytes > 0);
  const hashes = await Promise.all(
    [first, second].map(
      async (file) =>
        (
          await command('ffmpeg', [
            '-v',
            'error',
            '-xerror',
            '-i',
            file,
            '-map',
            '0:v',
            '-f',
            'hash',
            '-hash',
            'sha256',
            '-',
          ])
        ).stdout,
    ),
  );
  assert.equal(hashes[0], hashes[1], 'Installed cached video differs after decoding');
  await run('cache', 'clear', cache);
  assert.equal(JSON.parse((await run('cache', 'inspect', cache, '--json')).stdout).bytes, 0);
  console.log('  installed cache: repeat skips capture, decoded frames match, inspect/clear work');
}

async function exercisePreviewExport(projectDir: string) {
  const script = join(temporary, 'preview-export-smoke.mjs');
  await writeFile(script, previewExportSmokeSource);
  await command(process.execPath, [script, projectDir], temporary);
}
