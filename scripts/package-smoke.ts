import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkInstalledPreview } from './package-smoke-preview.ts';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify, parseArgs } from 'node:util';
const { values } = parseArgs({
  options: { browser: { type: 'boolean', default: false }, report: { type: 'string' } },
});
const report = {
  version: 1,
  status: 'running',
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  browserOnly: values.browser,
  packages: [] as string[],
  lockSha256: '',
  diagnostics: [] as unknown[],
  completed: [] as string[],
  error: null as string | null,
};

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
const names = [
  'core',
  'themes',
  ...(!values.browser ? ['renderer-remotion'] : []),
  'renderer-browser',
  'cli',
];
const pnpmBin = await packageBin('pnpm', 'pnpm');
const vpBin = await packageBin('vite-plus', 'vp');
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
  report.completed.push('build and pack');
  await installPackages();
  report.completed.push('fresh tarball installation');
  await reuseBrowser();
  await exerciseCli();
  report.status = 'passed';
  console.log('package-smoke: PASS (packed CLI, browser player, all themes, H.264 + AAC)');
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  if (values.report) {
    await mkdir(dirname(values.report), { recursive: true });
    await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
  }
  await rm(temporary, { recursive: true, force: true });
}

async function packageBin(name: string, bin: string) {
  const directory = join(root, 'node_modules', name);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  return join(directory, manifest.bin[bin]);
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
    names.map((name) => command(process.execPath, [vpBin, 'pack'], join(root, 'packages', name))),
  );
  await Promise.all(
    names.map((name) =>
      command(
        process.execPath,
        [pnpmBin, 'pack', '--pack-destination', temporary],
        join(root, 'packages', name),
      ),
    ),
  );
}

interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  bin?: { setcast: string };
}

/** Install published artifacts into a fresh dependency tree; no workspace dependency links. */
async function installPackages(): Promise<void> {
  const overrides = await packageOverrides();
  const dependencies = {
    '@setcast/cli': overrides['@setcast/cli'],
    ...(!values.browser
      ? { '@setcast/renderer-remotion': overrides['@setcast/renderer-remotion'] }
      : {}),
  };
  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
  );
  await writeFile(join(temporary, 'pnpm-workspace.yaml'), JSON.stringify({ overrides }, null, 2));
  await command(
    process.execPath,
    [pnpmBin, 'install', '--ignore-scripts', '--prefer-offline', '--no-frozen-lockfile'],
    temporary,
  );
  report.packages = (await readdir(join(modules, '.pnpm'))).filter(
    (name) => name !== 'node_modules' && name !== 'lock.yaml',
  );
  report.lockSha256 = createHash('sha256')
    .update(await readFile(join(temporary, 'pnpm-lock.yaml')))
    .digest('hex');
  await assertPackedSources();
  if (values.browser) await assertIndependentInstall();
}

async function assertPackedSources() {
  const cliManifest = join(modules, '@setcast/cli/package.json');
  const require = createRequire(await realpath(cliManifest));
  for (const name of names) {
    const manifest =
      name === 'cli' ? cliManifest : require.resolve(`@setcast/${name}/package.json`);
    const directory = dirname(manifest);
    assert(existsSync(join(directory, 'dist')), `Missing packed dist for ${name}`);
    assert(!existsSync(join(directory, 'src')), `Packed ${name} exposes workspace source files`);
  }
}

async function packageOverrides() {
  const overrides: Record<string, string> = {};
  for (const name of names) {
    const source = join(root, 'packages', name);
    const manifest: Manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    overrides[manifest.name] = pathToFileURL(
      join(temporary, `setcast-${name}-${manifest.version}.tgz`),
    ).href;
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      if (
        dependency.startsWith('@setcast/') ||
        manifest.peerDependenciesMeta?.[dependency]?.optional
      )
        continue;
      const installed = JSON.parse(
        await readFile(join(source, 'node_modules', dependency, 'package.json'), 'utf8'),
      );
      overrides[dependency] =
        installed.name === dependency
          ? installed.version
          : `npm:${installed.name}@${installed.version}`;
    }
  }
  return overrides;
}

async function assertIndependentInstall() {
  assert(!existsSync(join(modules, '@setcast/renderer-remotion')));
  const installed = await readdir(join(modules, '.pnpm'));
  assert(
    !installed.some((name) => /^(remotion@|@remotion\+|@setcast\+renderer-remotion@)/.test(name)),
    'Remotion appeared in the fresh browser installation',
  );
  const cli: Manifest = JSON.parse(
    await readFile(join(modules, '@setcast/cli/package.json'), 'utf8'),
  );
  assert(!cli.dependencies?.['@setcast/renderer-remotion']);
  assert.equal(cli.peerDependenciesMeta?.['@setcast/renderer-remotion']?.optional, true);
  console.log('  fresh tarball installation: no Remotion packages');
}

async function reuseBrowser(): Promise<void> {
  if (values.browser) return;
  const installed = join(root, 'packages/renderer-remotion/node_modules/.remotion');
  if (!existsSync(installed)) return;
  const target = join(modules, '@setcast/renderer-remotion/node_modules');
  await mkdir(target, { recursive: true });
  await symlink(
    installed,
    join(target, '.remotion'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

async function exerciseCli(): Promise<void> {
  const cliPackage = join(modules, '@setcast/cli');
  const manifest: Manifest = JSON.parse(await readFile(join(cliPackage, 'package.json'), 'utf8'));
  assert(manifest.bin?.setcast);
  const cli = join(cliPackage, manifest.bin.setcast);
  assert((await readFile(cli, 'utf8')).startsWith('#!/usr/bin/env node'));
  const run = (...args: string[]) => command(process.execPath, [cli, ...args], temporary);
  assert.equal((await run('--version')).stdout.trim(), manifest.version);
  await run('browser-install');
  await exerciseTooling(run);
  if (values.browser) await assertMissingAdapter(cli);
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
  assert.deepEqual(validated.renderer, { name: 'browser', checked: true });
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
  await exerciseBrowser(run, project);
  await exerciseDefaultCommands(run, cli);
  report.completed.push('default preview, clip and bundled export');
  if (!values.browser) await exerciseCompatibility(run, project);
}

async function exerciseTooling(run: (...args: string[]) => Promise<{ stdout: string }>) {
  for (const renderer of values.browser ? ['browser'] : ['browser', 'remotion']) {
    const capabilities = JSON.parse(
      (await run('capabilities', '--renderer', renderer, '--json')).stdout,
    );
    assert.equal(capabilities.version, 1);
    assert.equal(capabilities.renderer, renderer);
    assert(capabilities.features.includes('video'));
  }
  const doctor = JSON.parse((await run('doctor', '--json')).stdout);
  report.diagnostics.push(doctor);
  assert.equal(doctor.version, 1);
  assert.equal(doctor.ready, true);
  assert.equal(doctor.features.video, 'ready');
  const schema = JSON.parse((await run('schema', 'live')).stdout);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert(schema.properties.visualizer.anyOf.length > 0);
  assert.equal(JSON.parse((await run('schema', 'midi')).stdout).properties.version.const, 1);
}

async function exercisePlayer(projectDir: string): Promise<void> {
  const script = join(modules, '@setcast/cli', 'player-smoke.mjs');
  await writeFile(script, playerSmokeSource);
  await command(process.execPath, [script, projectDir], temporary);
}

async function exerciseBrowser(
  run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>,
  project: string,
) {
  assert((await run('browser-install', '--help')).stdout.includes('pinned Chromium'));
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
  report.diagnostics.push(doctor);
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
  await exerciseProres(run);
  report.completed.push(
    'all themes, playback, stills, video, cache, resume, preview export and ProRes',
  );
  console.log('  installed browser exporter: PNG, lossless WebP and H.264 + AAC');
}

async function exerciseProres(
  run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>,
) {
  const project = await proresFixture();
  const browser = [project, '--renderer', 'browser'];
  const validated = JSON.parse((await run('validate', ...browser, '--json')).stdout);
  assert.equal(validated.valid, true);
  const doctor = JSON.parse(
    (await run('doctor', '--renderer', 'browser', '--require', 'alpha,prores', '--json')).stdout,
  );
  assert.equal(doctor.ready, true);
  const movie = join(temporary, 'overlay.mov');
  await run('render', ...browser, '--bundle', '--out', movie);
  assert((await stat(join(temporary, 'overlay.png'))).size > 0);
  await run('still', ...browser, '--at', '0.1');
  assert((await stat(join(project, 'out', 'overlay.png'))).size > 0);
  await run(
    'clip',
    ...browser,
    '--at',
    '0.15',
    '--seconds',
    '10',
    '--out',
    join(temporary, 'clip.mov'),
  );
  const media = JSON.parse(
    (await command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', movie], temporary))
      .stdout,
  );
  assert.equal(media.streams[0].codec_name, 'prores');
  assert.equal(media.streams[0].profile, '4444');
  assert.equal(media.streams[0].nb_frames, '9');
  assert.equal(media.streams[1].codec_name, 'pcm_s24le');
  console.log('  installed ProRes: transparent PNG, MOV, clip, bundle and diagnostics');
}

async function proresFixture() {
  const project = join(temporary, 'prores-project');
  await mkdir(project);
  await command(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      '0.3',
      join(project, 'audio.wav'),
    ],
    temporary,
  );
  await writeFile(
    join(project, 'setcast.yaml'),
    `title: Compositing
renderer: browser
audio: audio.wav
visualizer: []
plays: [{at: 0, title: Transparent, artist: Fixture}]
output:
  width: 640
  height: 360
  codec: prores-4444
  transparent: true
  file: out/overlay.mov
`,
  );
  return project;
}

async function exerciseCache(
  run: (...args: string[]) => Promise<{ stdout: string; stderr: string }>,
  project: string,
) {
  const cache = join(temporary, 'render-cache');
  const first = join(temporary, 'cached-first.mp4');
  const second = join(temporary, 'cached-second.mp4');
  const args = [
    'render',
    project,
    '--renderer',
    'browser',
    '--theme',
    'bristol',
    '--range',
    '0-0.2',
    '--cache',
    cache,
  ];
  await run(...args, '--out', first);
  const repeated = await run(...args, '--out', second);
  assert(
    repeated.stderr.includes('6 reused, 0 newly rendered'),
    'Installed cache did not skip capture',
  );
  const before = JSON.parse((await run('cache', 'inspect', cache, '--json')).stdout);
  assert.equal(
    before.entries.filter((entry: { kind: string }) => entry.kind === 'video').length,
    1,
  );
  assert.equal(
    before.entries.filter((entry: { kind: string }) => entry.kind === 'analysis').length,
    1,
  );
  assert(
    repeated.stderr.includes('Reused prepared audio features'),
    'Installed cache repeated audio preparation',
  );
  assert(before.bytes > 0);
  await assertDecodedVideoEqual(first, second);
  await run('cache', 'clear', cache);
  assert.equal(JSON.parse((await run('cache', 'inspect', cache, '--json')).stdout).bytes, 0);
  console.log('  installed cache: repeat skips capture, decoded frames match, inspect/clear work');
}

async function assertDecodedVideoEqual(first: string, second: string) {
  const hashes = await Promise.all(
    [first, second].map(async (file) => {
      const result = await command('ffmpeg', [
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
      ]);
      return result.stdout;
    }),
  );
  assert.equal(hashes[0], hashes[1], 'Installed cached video differs after decoding');
}

async function exercisePreviewExport(projectDir: string) {
  const script = join(modules, '@setcast/cli', 'preview-export-smoke.mjs');
  await writeFile(script, previewExportSmokeSource);
  await command(process.execPath, [script, projectDir], temporary);
}

async function assertMissingAdapter(cli: string) {
  await assert.rejects(
    execute(process.execPath, [cli, 'capabilities', '--renderer', 'remotion'], { cwd: temporary }),
    (error: unknown) => {
      const failure = error as { code: number; stderr: string };
      return (
        failure.code === 2 &&
        failure.stderr.includes('Remotion renderer is not installed') &&
        failure.stderr.includes('alongside @setcast/cli')
      );
    },
  );
}

async function exerciseCompatibility(
  run: (...args: string[]) => Promise<{ stdout: string }>,
  project: string,
) {
  const validation = JSON.parse(
    (await run('validate', project, '--renderer', 'remotion', '--json')).stdout,
  );
  assert.deepEqual(validation.renderer, { name: 'remotion', checked: true });
  const out = join(temporary, 'compatibility.mp4');
  await run(
    'render',
    project,
    '--renderer',
    'remotion',
    '--range',
    '0-0.2',
    '--concurrency',
    '1',
    '--out',
    out,
  );
  const decoded = (
    await command('ffmpeg', [
      '-v',
      'error',
      '-xerror',
      '-i',
      out,
      '-map',
      '0:v',
      '-f',
      'framemd5',
      '-',
    ])
  ).stdout;
  assert.equal(decoded.split('\n').filter((line) => line && !line.startsWith('#')).length, 6);
  report.completed.push('optional Remotion validation and decoded export');
  console.log('  installed optional Remotion adapter: validation and six decoded export frames');
}

async function exerciseDefaultCommands(
  run: (...args: string[]) => Promise<{ stdout: string }>,
  cli: string,
) {
  const project = join(temporary, 'short-project');
  await mkdir(project);
  await command('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '0.2',
    join(project, 'audio.wav'),
  ]);
  await writeFile(join(project, 'art.svg'), BRANDING_LOGO);
  await writeFile(
    join(project, 'setcast.yaml'),
    `title: Installed default commands
audio: audio.wav
background: art.svg
plays: [{at: 0, title: Short fixture}]
output: {width: 640, height: 360, fps: 30}
`,
  );
  await checkInstalledPreview(cli, project);
  const clip = join(project, 'clip.mp4');
  await run('clip', project, '--at', '0', '--seconds', '10', '--out', clip);
  const bundle = join(project, 'bundle.mp4');
  await run('render', project, '--bundle', '--out', bundle);
  await assertVideoFrames(clip, 6);
  await assertVideoFrames(bundle, 6);
  assert((await stat(join(project, 'bundle.jpg'))).size > 0);
  assert((await readFile(join(project, 'bundle.txt'), 'utf8')).includes('Short fixture'));
  console.log(
    '  installed defaults: CLI preview, clip and bundled video, thumbnail and description',
  );
}

async function assertVideoFrames(file: string, expected: number) {
  const decoded = (
    await command('ffmpeg', [
      '-v',
      'error',
      '-xerror',
      '-i',
      file,
      '-map',
      '0:v',
      '-f',
      'framemd5',
      '-',
    ])
  ).stdout;
  assert.equal(
    decoded.split('\n').filter((line) => line && !line.startsWith('#')).length,
    expected,
  );
}
