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
    expect(project.events.map((event) => [event.type, event.time])).toEqual([
      ['track_start', 0],
      ['drop', 45],
      ['track_start', 90],
      ['track_start', 180],
    ]);
    const decks = project.events.flatMap((event) =>
      event.type === 'track_start' ? [event.deck] : [],
    );
    expect(decks).toEqual(['A', 'B', 'D']);
    expect(project.css).toContain('data:font/woff2;base64,');
    expect(project.css).not.toContain('./fonts/x.woff2');
    expect(project.modulation.map((route) => route.target)).toEqual(['bg-zoom', 'vignette']);
    expect(project.fps).toBe(30);
    expect(project.visualizer).toMatchObject({ name: 'spectrum', bars: 48 });
  });

  test('a track background must exist too', async () => {
    await expect(
      load(
        'audio: assets/mix.wav\ntheme: test\ntracks: [{ time: 0, title: X, background: assets/x.png }]\n',
        'track-bg',
      ),
    ).rejects.toThrow(/track "X" background file not found/);
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
    const assigned = project.events.map((event) =>
      event.type === 'track_start' ? [event.title, event.deck] : [],
    );
    expect(assigned).toEqual([
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

  test('a config read error other than ENOENT keeps its filesystem diagnosis', async () => {
    const root = join(dir, 'config-is-directory');
    await mkdir(join(root, 'setcast.yaml'), { recursive: true });

    await expect(loadProject(root)).rejects.toMatchObject({ code: 'EISDIR' });
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
    ).catch((thrown: unknown) => thrown);
    expect(err).toBeInstanceOf(ConfigError);

    const issues = (err as ConfigError).issues;
    expect(issues.map((issue) => issue.path).toSorted()).toEqual([
      'events[0].type',
      'events[1].time',
      'tracks[0].title',
    ]);
    const messages = issues.map((issue) => issue.message).join('\n');
    expect(messages).toMatch(/Invalid time "soon"/);
    expect(messages).toMatch(/cannot be empty/);
  });

  test('schema problems explain common config mistakes', async () => {
    const err = await load(
      `
audio: assets/mix.wav
theme: test
output: { fps: 29, widht: 1920 }
events:
  - { type: dropp, time: 0:45 }
  - { type: drop, time: 1:00, intensity: 2 }
modulation:
  - { source: bas, target: bg-zoom }
`,
      'helpful-schema',
    ).catch((thrown: unknown) => thrown);

    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).issues).toEqual(
      expect.arrayContaining([
        { path: 'output.fps', message: 'fps must be 24, 25, 30, 50 or 60.' },
        {
          path: 'output',
          message: 'Unrecognized key: "widht". Did you mean "width"?',
        },
        {
          path: 'events[0].type',
          message: expect.stringContaining('Unknown event type "dropp". Types:'),
        },
        { path: 'events[1].intensity', message: 'intensity is 0..1.' },
        {
          path: 'modulation[0].source',
          message:
            'Unknown source "bas". Audio: bass, mids, highs, rms, onset. Timeline: since:<event> or until:<event>. Tempo: beat, bar.',
        },
      ]),
    );
  });

  test('an empty config and a YAML list explain the required shape', async () => {
    const empty = await load('', 'empty-config').catch((thrown: unknown) => thrown);
    expect(empty).toBeInstanceOf(ConfigError);
    expect((empty as ConfigError).issues).toContainEqual({
      path: 'audio',
      message: 'audio is required: the path to your mix file, e.g. assets/mix.wav.',
    });

    const list = await load('- audio: assets/mix.wav\n', 'list-config').catch(
      (thrown: unknown) => thrown,
    );
    expect(list).toBeInstanceOf(ConfigError);
    expect((list as ConfigError).issues).toContainEqual({
      path: '',
      message: 'setcast.yaml must be a YAML mapping of keys and values, not a list.',
    });
  });

  test('unknown theme lists built-ins; missing audio says where it looked', async () => {
    await expect(load('audio: assets/mix.wav\ntheme: neon\n', 'bad-theme')).rejects.toMatchObject({
      hint: expect.stringContaining('Built-in themes: test'),
    });
    await expect(
      load('audio: assets/missing.wav\ntheme: test\n', 'bad-audio'),
    ).rejects.toBeInstanceOf(SetcastError);
  });

  test('asset paths cannot leave the project directory', async () => {
    await expect(load('audio: /tmp/mix.wav\ntheme: test\n', 'abs')).rejects.toThrow(
      /leaves the project directory/,
    );
    await expect(
      load('audio: assets/../../outside.wav\ntheme: test\n', 'traversal'),
    ).rejects.toThrow(/leaves the project directory/);
    await expect(
      load('audio: assets/mix.wav\ntheme: css/../../outside.css\n', 'theme-traversal'),
    ).rejects.toThrow(/leaves the project directory/);
  });

  test('warns about ignored settings and ambiguous track timing', async () => {
    const { warnings } = await load(
      `
audio: assets/mix.wav
theme: test
panel: { dwell: 0, fade: 2 }
tracks:
  - { time: 1:00, title: Late }
  - { time: 0:00, title: Early }
  - { time: 0:00, title: Duplicate }
modulation:
  - { source: beat, target: beat-pulse }
  - { source: since:drop, target: drop-fade, smooth: 0.2 }
  - { source: bass, target: bass-pulse, window: 3 }
`,
      'warnings',
    );

    expect(warnings.join('\n')).toMatch(/uses beat, but the project has no bpm/);
    expect(warnings.join('\n')).toMatch(/smooth only applies to audio sources/);
    expect(warnings.join('\n')).toMatch(/window only applies to timeline sources/);
    expect(warnings.join('\n')).toMatch(/uses when: drop, but the set has no drop events/);
    expect(warnings.join('\n')).toMatch(/appears after a later track/);
    expect(warnings.join('\n')).toMatch(/both start at 0 s/);
    expect(warnings).toContain('panel.fade has no effect when panel.dwell is 0.');
  });
});
