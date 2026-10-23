import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, expect, test, vi } from 'vite-plus/test';
import type { Theme } from '../theme.ts';
import { validateProject } from './validate.ts';

let root: string;
let themes: Record<string, Theme>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'setcast-validation-'));
  const cssFile = join(root, 'theme.css');
  await writeFile(cssFile, '.setcast { color: white; }');
  themes = { 'sterile-tech': { name: 'sterile-tech', cssFile, modulation: [] } };
});
afterEach(() => rm(root, { recursive: true, force: true }));
const write = async (file: string, text: string) => {
  await mkdir(join(root, file, '..'), { recursive: true });
  await writeFile(join(root, file), text);
};

async function recorded(extra = '') {
  await write('mix.wav', 'RIFF');
  await write('setcast.yaml', `audio: mix.wav\nplays: [{at: 0, title: Test}]\n${extra}`);
}

test('recorded validation probes duration, reports resolved dimensions and does not require decoded audio', async () => {
  await recorded();
  const probeDuration = vi.fn(async () => 60);
  const report = await validateProject(root, { themes, probeDuration });
  expect(probeDuration).toHaveBeenCalledExactlyOnceWith('mix.wav', root);
  expect(report).toMatchObject({
    version: 1,
    valid: true,
    exitCode: 0,
    kind: 'project',
    diagnostics: [],
  });
  expect(report.documents).toMatchObject([
    {
      file: 'setcast.yaml',
      usesDefaults: false,
      summary: { durationSeconds: 60, width: 1920, visualizers: ['spectrum'] },
    },
  ]);
  expect(JSON.parse(JSON.stringify(report))).toEqual(report);
});

test('live validation makes omitted-file defaults explicit and never probes audio', async () => {
  const probeDuration = vi.fn(async () => {
    throw new Error('must not probe');
  });
  const report = await validateProject(root, { kind: 'live', themes, probeDuration });
  expect(report.valid).toBe(true);
  expect(report.documents).toMatchObject([
    { file: 'live.yaml', usesDefaults: true, summary: { durationSeconds: null } },
  ]);
  expect(probeDuration).not.toHaveBeenCalled();
});

test('schema failures retain file and issue paths instead of becoming unstructured renderer errors', async () => {
  await write('live.yaml', 'input: {gain: 100}\nbranding: {unknown: true}');
  const report = await validateProject(root, { kind: 'live', themes });
  expect(report).toMatchObject({ valid: false, exitCode: 2 });
  expect(report.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        level: 'error',
        code: 'configuration',
        file: 'live.yaml',
        path: 'input.gain',
      }),
      expect.objectContaining({ file: 'live.yaml', path: 'branding' }),
    ]),
  );
});

test('live validation checks each directly sequenced scene once and gathers scene warnings', async () => {
  await write(
    'live.yaml',
    'sequence: {scenes: [{preset: saved-scene-a}, {preset: saved-scene-a}]}',
  );
  await write('saved-scene-a/live.yaml', 'visualizer: {name: overview}');
  const report = await validateProject(root, { kind: 'live', themes });
  expect(report.valid).toBe(true);
  expect(report.documents.map((document) => document.file)).toEqual([
    'live.yaml',
    'saved-scene-a/live.yaml',
  ]);
  expect(report.diagnostics).toMatchObject([
    { level: 'warning', code: 'project-warning', file: 'saved-scene-a/live.yaml' },
  ]);
});

test('invalid live scene controls have the referenced filename and keep the root result', async () => {
  await write('live.yaml', 'sequence: {scenes: [{preset: saved-scene-a}]}');
  await write('saved-scene-a/live.yaml', 'visualizer: {name: field, recoverySeconds: 99}');
  const report = await validateProject(root, { kind: 'live', themes });
  expect(report.documents.map((document) => document.valid)).toEqual([true, false]);
  expect(report.diagnostics).toMatchObject([
    { file: 'saved-scene-a/live.yaml', path: 'visualizer.recoverySeconds' },
  ]);
  expect(report.exitCode).toBe(2);
});

test('recorded scene configuration errors preserve their path through the authoritative loader', async () => {
  await recorded('scenes: [{at: 0, preset: scenes/opening}]');
  await write('scenes/opening/live.yaml', 'branding: {position: unknown}');
  const report = await validateProject(root, { themes, probeDuration: async () => 60 });
  expect(report.diagnostics).toMatchObject([
    {
      file: 'scenes/opening/live.yaml',
      path: 'branding.position',
      hint: expect.stringContaining('docs/live-input.md'),
    },
  ]);
  expect(report.exitCode).toBe(2);
});

test('timeline refinements remain authoritative and identify the authored document', async () => {
  await recorded('annotations: [{at: 90, kind: drop}]');
  const report = await validateProject(root, { themes, probeDuration: async () => 60 });
  expect(report.valid).toBe(false);
  expect(report.diagnostics[0]?.file).toBe('setcast.yaml');
  expect(report.diagnostics[0]?.context).toBeDefined();
  expect(report.exitCode).toBe(2);
});

test('missing configuration and assets fail; unexpected probe failures use runtime status', async () => {
  const missing = await validateProject(root, { themes });
  expect(missing).toMatchObject({ valid: false, exitCode: 2 });
  await write('live.yaml', 'branding: {logo: absent.svg}');
  expect(await validateProject(root, { kind: 'live', themes })).toMatchObject({
    valid: false,
    exitCode: 2,
  });
  await recorded();
  const broken = await validateProject(root, {
    themes,
    probeDuration: async () => {
      throw new Error('probe unavailable');
    },
  });
  expect(broken).toMatchObject({
    valid: false,
    exitCode: 1,
    diagnostics: [{ code: 'runtime', message: 'probe unavailable' }],
  });
});
