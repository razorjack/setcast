import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vite-plus/test';
import { ConfigError, SetcastError } from '../errors.ts';
import type { Theme } from '../theme.ts';
import { loadProject } from './project.ts';

let dir: string;
let theme: Theme;

const write = async (name: string, content: string | Buffer) => {
  const path = join(dir, name);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'setcast-test-'));
  await write('theme/fonts/x.woff2', 'font');
  await write('theme/theme.css', '@font-face { src: url(./fonts/x.woff2); }\n.t { color: red }');
  theme = {
    name: 'test',
    cssFile: join(dir, 'theme/theme.css'),
    modulation: [
      {
        source: 'bass',
        target: 'bg-zoom',
        range: [1, 1.05],
        curve: 'pow2',
        smooth: 0,
        when: 'drop',
      },
    ],
  };
});

const load = async (yaml: string, sub = 'p') => {
  await write(`${sub}/assets/mix.wav`, 'RIFF');
  await write(`${sub}/assets/bg.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await write(`${sub}/setcast.yaml`, yaml);
  return loadProject(join(dir, sub), { themes: { test: theme } });
};

describe('loadProject', () => {
  test('resolves a valid project: merged events, alternating decks, inlined theme css', async () => {
    const { project } = await load(`
audio: assets/mix.wav
background: assets/bg.png
theme: test
tracks:
  - { time: 0:00, artist: A, title: One }
  - { time: 1:30, artist: B, title: Two }
  - { time: 3:00, title: Three, deck: D }
events:
  - { type: drop, time: 0:45 }
modulation:
  - { source: rms, target: vignette }
`);
    expect(project.events.map((e) => [e.type, e.time])).toEqual([
      ['track_start', 0],
      ['drop', 45],
      ['track_start', 90],
      ['track_start', 180],
    ]);
    const decks = project.events.flatMap((e) => (e.type === 'track_start' ? [e.deck] : []));
    expect(decks).toEqual(['A', 'B', 'D']);
    expect(project.css).toContain('data:font/woff2;base64,');
    expect(project.css).not.toContain('./fonts/x.woff2');
    expect(project.modulation.map((r) => r.target)).toEqual(['bg-zoom', 'vignette']);
    expect(project.fps).toBe(30);
    expect(project.visualizer).toMatchObject({ name: 'spectrum', bars: 48 });
  });

  test('an unknown visualizer is reported while loading', async () => {
    await expect(
      load('audio: assets/mix.wav\ntheme: test\nvisualizer: { name: plasma }\n', 'bad-viz'),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  test('decks alternate in play order, and an explicit deck moves the rotation on', async () => {
    const { project } = await load(
      `
audio: assets/mix.wav
theme: test
tracks:
  - { time: 3:00, title: Third }
  - { time: 0:00, title: First }
  - { time: 1:30, title: Second, deck: A }
  - { time: 4:30, title: Fourth }
events:
  - { type: track_start, time: 6:00, title: Fifth }
`,
      'decks',
    );
    expect(project.events.map((e) => (e.type === 'track_start' ? [e.title, e.deck] : []))).toEqual([
      ['First', 'A'],
      ['Second', 'A'],
      ['Third', 'B'],
      ['Fourth', 'A'],
      ['Fifth', 'B'],
    ]);
  });

  test('missing setcast.yaml points at init', async () => {
    await expect(loadProject(join(dir, 'nope'))).rejects.toMatchObject({
      message: expect.stringContaining('No setcast.yaml'),
      hint: expect.stringContaining('setcast init'),
    });
  });

  test('broken yaml reports the line', async () => {
    await expect(load('audio: [oops\n', 'bad-yaml')).rejects.toThrow(/not valid YAML/);
  });

  test('schema problems list paths and messages', async () => {
    const err = await load(
      `
audio: assets/mix.wav
theme: test
events:
  - { type: dropp, time: 0:45 }
  - { type: drop, time: soon }
tracks:
  - { time: 0:00, title: '' }
`,
      'bad-schema',
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    const issues = (err as ConfigError).issues;
    expect(issues.map((i) => i.path).toSorted()).toEqual([
      'events[0].type',
      'events[1].time',
      'tracks[0].title',
    ]);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/Invalid time "soon"/);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/cannot be empty/);
  });

  test('unknown theme lists built-ins; missing audio says where it looked', async () => {
    await expect(load('audio: assets/mix.wav\ntheme: neon\n', 'bad-theme')).rejects.toMatchObject({
      hint: expect.stringContaining('Built-in themes: test'),
    });
    await expect(
      load('audio: assets/missing.wav\ntheme: test\n', 'bad-audio'),
    ).rejects.toBeInstanceOf(SetcastError);
  });

  test('absolute asset paths are rejected up front', async () => {
    await expect(load('audio: /tmp/mix.wav\ntheme: test\n', 'abs')).rejects.toBeInstanceOf(
      ConfigError,
    );
  });

  test('asset paths cannot leave the project directory', async () => {
    await expect(
      load('audio: assets/../../outside.wav\ntheme: test\n', 'traversal'),
    ).rejects.toBeInstanceOf(ConfigError);
    await expect(
      load('audio: assets/mix.wav\ntheme: css/../../outside.css\n', 'theme-traversal'),
    ).rejects.toThrow(/leaves the project directory/);
  });
});
