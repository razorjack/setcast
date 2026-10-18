import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test';
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

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const load = async (yaml: string, sub = 'p', themes: Record<string, Theme> = { test: theme }) => {
  await write(`${sub}/assets/mix.wav`, 'RIFF');
  await write(`${sub}/assets/bg.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await write(`${sub}/setcast.yaml`, yaml);
  return loadProject(join(dir, sub), { themes, probeDuration: async () => 600 });
};

describe('loadProject', () => {
  test('resolves a finite mix and inlines theme CSS', async () => {
    const { project } = await load(`
audio: assets/mix.wav
background: assets/bg.png
theme: test
plays:
  - {at: 0, until: 100, title: One}
  - {at: 90, title: Two}
annotations: [{kind: drop, at: 45}]
modulation: [{source: rms, target: vignette}]
`);
    expect(project.mix.contributions.map((interval) => [interval.from, interval.until])).toEqual([
      [0, 100_000_000],
      [90_000_000, 600_000_000],
    ]);
    expect(project.mix.contributions.every((interval) => interval.deck === undefined)).toBe(true);
    expect(project.presentation).toBe('dj');
    expect(project.css).toContain('data:font/woff2;base64,');
    expect(project.modulation.map((route) => route.target)).toEqual(['bg-zoom', 'vignette']);
    expect(project.visualizers).toMatchObject([{ name: 'spectrum', bars: 48 }]);
  });

  test.each(['14:03', '843'])('resolves clockOffset %s without moving events', async (offset) => {
    const { project } = await load(`
audio: assets/mix.wav
theme: test
clockOffset: ${offset}
plays: [{ at: 0, title: Star Trails }]
annotations: [{ kind: drop, at: 14 }]
`);
    expect(project.clockOffset).toBe(843);
    expect(project.mix.annotations[0]?.at).toBe(14_000_000);
  });

  test.each(['-1', 'soon'])(
    'rejects invalid clockOffset %s with its config path',
    async (offset) => {
      await expect(
        load(`audio: assets/mix.wav\ntheme: test\nclockOffset: ${offset}\n`),
      ).rejects.toMatchObject({
        issues: [
          {
            path: 'clockOffset',
            message: expect.stringContaining(`Invalid time "${offset}". Use seconds`),
          },
        ],
      });
    },
  );

  test.each(['56:06', '3366'])(
    'resolves clockTotal %s independently of the offset',
    async (total) => {
      const { project } = await load(
        `audio: assets/mix.wav\ntheme: test\nclockOffset: 14:03\nclockTotal: ${total}\n`,
      );
      expect(project.clockTotal).toBe(3366);
      expect(project.clockOffset).toBe(843);
    },
  );

  test.each([
    ['0', 'clockTotal must be greater than 0. Use the full mix duration, e.g. 56:06.'],
    ['-1', 'Invalid time "-1". Use seconds'],
    ['soon', 'Invalid time "soon". Use seconds'],
  ])('rejects invalid clockTotal %s', async (total, message) => {
    await expect(
      load(`audio: assets/mix.wav\ntheme: test\nclockTotal: ${total}\n`),
    ).rejects.toMatchObject({
      issues: [{ path: 'clockTotal', message: expect.stringContaining(message) }],
    });
  });

  test('a track background must exist too', async () => {
    await expect(
      load(
        'audio: assets/mix.wav\ntheme: test\nplays: [{ at: 0, title: X, background: assets/x.png }]\n',
        'track-bg',
      ),
    ).rejects.toThrow(/plays\[0\].background file not found/);
  });

  test('an unknown visualizer is reported while loading', async () => {
    await expect(
      load('audio: assets/mix.wav\ntheme: test\nvisualizer: { name: plasma }\n', 'bad-viz'),
    ).rejects.toMatchObject({
      issues: [{ path: 'visualizer.name', message: expect.stringContaining('Available: ') }],
    });
  });

  test('visualizer takes a list, drawn in order, and errors name the entry', async () => {
    const yaml = (list: string) => `audio: assets/mix.wav\ntheme: test\nvisualizer: ${list}\n`;
    const { project } = await load(yaml('[{ name: radial }, { name: spectrum, bars: 12 }]'));
    expect(project.visualizers).toMatchObject([{ name: 'radial' }, { name: 'spectrum', bars: 12 }]);
    expect((await load(yaml('[]'))).project.visualizers).toEqual([]);

    await expect(
      load(yaml('[{ name: radial }, { name: spectrum, bars: 2 }]')),
    ).rejects.toMatchObject({ issues: [{ path: 'visualizer[1].bars' }] });
    await expect(load(yaml('radial'))).rejects.toMatchObject({
      issues: [{ path: 'visualizer', message: expect.stringContaining('{ name: radial }') }],
    });
  });

  test("a theme's visualizer is drawn unless the project names its own", async () => {
    const drawn: Theme = { ...theme, name: 'drawn', visualizer: [{ name: 'radial', bars: 12 }] };
    const themes = { drawn };
    const { project } = await load('audio: assets/mix.wav\ntheme: drawn\n', 'theme-viz', themes);
    expect(project.visualizers).toMatchObject([{ name: 'radial', bars: 12, spin: 2 }]);

    const own = await load('audio: assets/mix.wav\ntheme: drawn\nvisualizer: []\n', 'own', themes);
    expect(own.project.visualizers).toEqual([]);
  });

  test('a theme passed to loadProject replaces the one setcast.yaml names', async () => {
    const other: Theme = { ...theme, name: 'other', visualizer: { name: 'meters' } };
    await load('audio: assets/mix.wav\ntheme: test\n', 'override');
    const { project } = await loadProject(join(dir, 'override'), {
      themes: { test: theme, other },
      theme: 'other',
      probeDuration: async () => 600,
    });
    expect(project.theme).toBe('other');
    expect(project.visualizers).toMatchObject([{ name: 'meters' }]);
  });

  test("an invalid theme visualizer names the theme, not the project's setcast.yaml", async () => {
    const broken: Theme = { ...theme, name: 'broken', visualizer: { name: 'radial', bars: 2 } };
    await expect(
      load('audio: assets/mix.wav\ntheme: broken\n', 'broken-viz', { broken }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Theme "broken" has an invalid default visualizer: .*bars/),
      hint: expect.stringContaining('same blocks as visualizer:'),
    });
  });

  test("a theme's tracklist shows unless the project turns it off; errors name the theme", async () => {
    const listing: Theme = { ...theme, name: 'listing', tracklist: { after: 3 } };
    const themes = { listing };
    const shown = await load('audio: assets/mix.wav\ntheme: listing\n', 'tl', themes);
    expect(shown.project.tracklist).toEqual({ before: 2, after: 3 });
    const off = await load(
      'audio: assets/mix.wav\ntheme: listing\ntracklist: false\n',
      'tl',
      themes,
    );
    expect(off.project.tracklist).toBeNull();

    const broken: Theme = { ...theme, name: 'broken', tracklist: { before: -1 } };
    await expect(
      load('audio: assets/mix.wav\ntheme: broken\n', 'broken-tl', { broken }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/^Theme "broken" has an invalid default tracklist: .*before/),
      hint: expect.stringContaining('same keys as tracklist:'),
    });
  });

  test('tracklist errors say what the key takes', async () => {
    const yaml = (tracklist: string) =>
      `audio: assets/mix.wav\ntheme: test\ntracklist: ${tracklist}\n`;
    await expect(load(yaml('yes'))).rejects.toMatchObject({
      issues: [{ path: 'tracklist', message: expect.stringContaining('true, false or a mapping') }],
    });
    await expect(load(yaml('{before: 1.5}'))).rejects.toMatchObject({
      issues: [{ message: 'before must be a whole number of listings from 0 to 99.' }],
    });
    await expect(load(yaml('{rows: 3}'))).rejects.toMatchObject({
      issues: [{ message: 'tracklist takes before and after, not rows.' }],
    });
  });

  test('mode changes presentation without changing the normalized mix', async () => {
    const yaml =
      'audio: assets/mix.wav\ntheme: test\nplays: [{at: 0, until: 100, title: One}, {at: 90, title: Two}]\n';
    const auto = await load(yaml);
    const playlist = await load(`${yaml}presentation: {mode: playlist}\n`);
    expect(auto.project.mix).toEqual(playlist.project.mix);
    expect(playlist.project.presentation).toBe('playlist');
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

  test('schema errors name paths and repairs', async () => {
    const err = await load(
      'audio: assets/mix.wav\ntheme: test\nplays: [{at: 0, until: 10, title: A, contributions: [{from: 0, until: 10}]}]\n',
    ).catch((error: unknown) => error);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).issues).toContainEqual({
      path: 'plays[0].until',
      message: expect.stringContaining('remove the row-level until'),
    });
  });

  test('output files must use a supported video extension', async () => {
    const err = await load(
      'audio: assets/mix.wav\ntheme: test\noutput: { file: out/set.avi }\n',
      'bad-output-file',
    ).catch((thrown: unknown) => thrown);

    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).issues).toContainEqual({
      path: 'output.file',
      message: 'file must end in .mp4, .mov or .mkv.',
    });
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

  test('absolute paths inside the project are rejected with their relative replacement', async () => {
    const audio = join(dir, 'absolute-inside/assets/mix.wav');
    await expect(
      load(`audio: ${JSON.stringify(audio)}\ntheme: test\n`, 'absolute-inside'),
    ).rejects.toMatchObject({
      message: `audio requires a project-relative path: ${audio}`,
      hint: 'Use "assets/mix.wav" in setcast.yaml.',
    });
  });

  test('panel: false shows no panels; true and a mapping keep them', async () => {
    const yaml = (panel: string) => `audio: assets/mix.wav\ntheme: test\npanel: ${panel}\n`;
    expect((await load(yaml('false'))).project.panel).toBeNull();
    expect((await load(yaml('true'))).project.panel).toEqual({ dwell: 14, fade: 1.2 });
    expect((await load(yaml('{ dwell: 6 }'))).project.panel).toEqual({ dwell: 6, fade: 1.2 });
  });

  test('panel errors say what the key takes', async () => {
    const yaml = (panel: string) => `audio: assets/mix.wav\ntheme: test\npanel: ${panel}\n`;
    await expect(load(yaml('off'))).rejects.toMatchObject({
      issues: [{ path: 'panel', message: expect.stringContaining('true, false or a mapping') }],
    });
    await expect(load(yaml('{ dwel: 6 }'))).rejects.toMatchObject({
      issues: [{ message: 'panel takes dwell and fade, not dwel.' }],
    });
    await expect(load(yaml('{ dwell: -1 }'))).rejects.toMatchObject({
      issues: [{ message: 'dwell must be from 0 to 3600 seconds.' }],
    });
  });

  test('panel: false warns about plays that nothing credits', async () => {
    const plays =
      'plays: [{at: 0, title: Listed}, {title: Loop, contributions: [{from: 10, until: 20}]}]\n';
    const yaml = (tracklist: string) =>
      `audio: assets/mix.wav\ntheme: test\npanel: false\ntracklist: ${tracklist}\n${plays}`;
    expect((await load(yaml('false'))).warnings).toContain(
      'panel is false and the tracklist is off, so the video credits no plays. Set tracklist: true to list them.',
    );
    expect((await load(yaml('true'))).warnings).toContain(
      'panel is false, so plays without an at time are not credited: plays[1] Loop. Give them at: to list them.',
    );
  });

  test.each([
    ['{ dwell: 0 }', false],
    ['{ dwell: 0, fade: 1.2 }', true],
  ])('only warns about an explicitly configured unused panel fade: %s', async (panel, warned) => {
    const { warnings } = await load(`audio: assets/mix.wav\ntheme: test\npanel: ${panel}\n`);
    expect(warnings.includes('panel.fade has no effect when panel.dwell is 0.')).toBe(warned);
  });

  test('warns about ignored settings and ambiguous track timing', async () => {
    const { warnings } = await load(
      `
audio: assets/mix.wav
theme: test
panel: { dwell: 0, fade: 2 }
plays:
  - { at: 1:00, title: Late }
  - { at: 0:00, title: Early }
  - { at: 0:00, title: Duplicate }
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
    expect(warnings.join('\n')).toMatch(/uses when: drop, but the set has no drop annotations/);
    expect(warnings).toContain('panel.fade has no effect when panel.dwell is 0.');
  });
});
