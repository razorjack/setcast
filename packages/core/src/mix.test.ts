import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vite-plus/test';
import { normalizeMix, readMixDocument, mixWarnings } from './mix.ts';
import { Timeline, lastAnnotations } from './timeline.ts';
import { ConfigError } from './errors.ts';

const timeline = (input: unknown, duration = 300) => new Timeline(normalizeMix(input, duration));
const names = (mix: Timeline, time: number) =>
  mix.at(time).currentPlays.map((entry) => entry.play.id);
const activeRow = (play: ReturnType<typeof row>, time: number) =>
  play.contributions.some((interval) => interval.from <= time && time < interval.until);
const row = (id: string, intervals: [number, number][]) => ({
  id,
  title: id,
  contributions: intervals.map(([from, until]) => ({ from, until })),
});
const rejects = (input: unknown, message: RegExp, duration = 300) => {
  try {
    normalizeMix(input, duration);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect(
      (error as ConfigError).issues.map((issue) => `${issue.path} ${issue.message}`).join('\n'),
    ).toMatch(message);
  }
};

describe('finite mix normalization', () => {
  test('cuts, gaps, blends, editorial independence and mechanical origins', () => {
    const basic = timeline({
      plays: [
        { id: 'a', at: 10, title: 'A' },
        { id: 'b', at: 200, title: 'B' },
      ],
    });
    expect(names(basic, 0)).toEqual([]);
    expect(names(basic, 200)).toEqual(['b']);
    expect(basic.document.contributions[0]?.origins).toEqual({
      from: { kind: 'listing', path: 'plays[0].at' },
      until: { kind: 'next_listing', path: 'plays[1].at' },
    });
    const blend = timeline({
      plays: [
        { id: 'a', at: 0, until: 225, title: 'A' },
        { ...row('b', [[170, 300]]), at: 200 },
      ],
    });
    expect(names(blend, 210)).toEqual(['a', 'b']);
    expect(blend.document.chapters[1]?.at).toBe(200_000_000);
    expect(blend.overlaps).toBe(true);
    expect(blend.document.contributions[1]?.origins.from.kind).toBe('authored');
  });
  test('unlisted overlays do not truncate fallback and tied listings share the next distinct end', () => {
    const mix = timeline({
      plays: [
        { id: 'a', title: 'A', at: 0 },
        { id: 'b', title: 'B', at: 0 },
        row('tease', [[60, 68]]),
        { id: 'c', title: 'C', at: 180 },
      ],
    });
    expect(names(mix, 64)).toEqual(['a', 'b', 'tease']);
    expect(names(mix, 179)).toEqual(['a', 'b']);
    expect(mix.document.chapters).toEqual([
      { at: 0, title: 'A / B' },
      { at: 180_000_000, title: 'C' },
    ]);
  });
  test('repeated teases and shared drops use runs, not tags', () => {
    const mix = timeline({
      plays: [
        row('foundation', [[0, 260]]),
        row('visitor', [
          [60, 68],
          [84, 92],
          [120, 300],
        ]),
      ],
      annotations: [{ at: 140, kind: 'drop', participants: ['foundation', 'visitor'] }],
      focus: [{ at: 0, plays: ['foundation'] }],
    });
    expect([64, 72, 88, 100, 140, 270].map((time) => mix.at(time).currentPlayCount)).toEqual([
      2, 1, 2, 1, 2, 1,
    ]);
    expect(mix.at(64).focusPlays[0]?.play.id).toBe('foundation');
    expect(mix.at(140).currentPlays.map((play) => play.section?.kind)).toEqual(['drop', 'drop']);
    expect(mix.at(100).nextEntries[0]?.returning).toBe(true);
  });
  test('rewinds can target an ended run and reloads start unknown until an explicit drop', () => {
    const mix = timeline({
      plays: [
        row('a', [
          [0, 60],
          [68, 180],
        ]),
        row('b', [
          [40, 60],
          [68, 180],
        ]),
      ],
      annotations: [
        { at: 48, kind: 'drop', participants: ['a', 'b'] },
        { at: 60, kind: 'rewind', participants: ['a', 'b'] },
        { at: 69, kind: 'drop', participants: ['a', 'b'] },
      ],
    });
    expect(names(mix, 60)).toEqual([]);
    expect(mix.at(68).currentPlays.map((play) => play.section)).toEqual([null, null]);
    expect(mix.at(69).currentPlays.map((play) => play.section?.kind)).toEqual(['drop', 'drop']);
  });
  test('copies, deck reuse, tails and metadata segmentation do not imply occupancy', () => {
    const mix = timeline({
      recordings: { shared: { title: 'ID' } },
      plays: [
        {
          id: 'a',
          recording: 'shared',
          contributions: [
            { from: 0, until: 60, deck: '6' },
            { from: 60, until: 70, deck: 'A', tail: true },
          ],
        },
        { id: 'b', recording: 'shared', contributions: [{ from: 62, until: 'end', deck: 'A' }] },
      ],
      annotations: [{ at: 50, kind: 'drop', scope: { plays: ['a'] } }],
    });
    expect(mix.at(65).recordingCount).toBe(1);
    expect(mix.at(65).playCount).toBe(2);
    expect(mix.at(65).focusPlays[0]?.play.id).toBe('b');
    expect(mix.at(65).currentPlays[0]?.run.from).toBe(0);
    expect(mix.at(65).currentPlays[0]?.section?.kind).toBe('drop');
    expect(names(mix, 70)).toEqual(['b']);
  });
  test('arbitrary cardinality, scope conflicts and independent mix/local sections', () => {
    const plays = Array.from({ length: 8 }, (_, index) => row(`p${index}`, [[0, 300]]));
    const mix = timeline({
      plays,
      annotations: [
        { at: 20, kind: 'drop', participants: plays.map((play) => play.id) },
        { at: 50, kind: 'drop' },
        { at: 50, kind: 'breakdown', scope: { plays: ['p1'] } },
      ],
    });
    expect(mix.at(20).currentPlayCount).toBe(8);
    expect(mix.at(50).mixSection?.kind).toBe('drop');
    expect(mix.at(50).currentPlays[1]?.section?.kind).toBe('breakdown');
    rejects(
      {
        plays,
        annotations: [
          { at: 50, kind: 'drop', participants: ['p1'] },
          { at: 50, kind: 'breakdown', scope: { plays: ['p1'] } },
        ],
      },
      /section writes.*conflict/,
    );
  });
  test('pins retire per selected run and random access equals forward and reverse queries', () => {
    const input = {
      plays: [
        row('a', [
          [0, 20],
          [25, 300],
        ]),
        row('b', [[0, 30]]),
      ],
      focus: [{ at: 10, plays: ['a', 'b'] }],
    };
    const mix = timeline(input);
    expect(mix.at(25).focusPlays.map((play) => play.play.id)).toEqual(['b']);
    expect(mix.at(30).focusPlays.map((play) => play.play.id)).toEqual(['a']);
    for (const time of [0, 10, 20, 25, 30, 299, 30, 25, 20, 10, 0])
      expect(mix.at(time)).toEqual(timeline(input).at(time));
  });
  test('evidence, extensions, normalized JSON, warnings and explicit empty chapters', () => {
    const mix = normalizeMix(
      {
        sources: { note: { title: 'Inherited annotation' } },
        plays: [
          {
            ...row('a', [[10, 20]]),
            at: 0,
            evidence: ['note'],
            extensions: { 'test:payload': { preserved: true } },
          },
        ],
        chapters: [],
        annotations: [{ at: 5, kind: 'test:cue', data: [null, true] }],
      },
      300,
    );
    expect(mixWarnings(mix)[0]).toMatch(/plays\[0\].at.*outside/);
    expect(mix.chapters).toEqual([]);
    expect(readMixDocument(JSON.parse(JSON.stringify(mix)))).toEqual(
      JSON.parse(JSON.stringify(mix)),
    );
    expect(mix.recordings[0]?.evidence).toEqual(['note']);
    expect(mix.contributions[0]?.evidence).toBeUndefined();
  });
  test('groups tied moments, spans are half open, last includes now and next excludes now', () => {
    const mix = timeline({
      annotations: [
        { at: 10, kind: 'note', text: 'one' },
        { at: 10, kind: 'note', text: 'two' },
        { at: 5, until: 10, kind: 'technique', tags: ['loop'] },
      ],
    });
    expect(lastAnnotations(mix.at(10), 'note')).toHaveLength(2);
    expect(mix.at(9).activeAnnotations).toHaveLength(1);
    expect(mix.at(10).activeAnnotations).toHaveLength(0);
    expect(mix.at(10).annotations.mix.next.note).toBeUndefined();
  });
  test('known inherited demo retains 77 and 44 second overlaps', () => {
    const fixture = parse(
      readFileSync(
        new URL('../../../examples/demo/fixtures/knowledge-excerpt.yaml', import.meta.url),
        'utf8',
      ),
    );
    const mix = timeline(fixture, 331);
    expect(mix.runs[0]!.until - mix.runs[1]!.from).toBe(77_000_000);
    expect(mix.runs[1]!.until - mix.runs[2]!.from).toBe(44_000_000);
  });
  test('microsecond rounding, range checks and positive durations apply after normalization', () => {
    const mix = timeline({ plays: [{ title: 'A', at: 0.0000005 }] });
    expect(mix.document.listings[0]?.at).toBe(1);
    rejects({ plays: [row('a', [[0, 0.0000004]])] }, /positive duration/);
    rejects({ annotations: [{ at: 300, kind: 'drop' }] }, /before mix end/);
    rejects({ plays: [{ title: 'A', at: '1:60' }] }, /Invalid time/);
    expect(() => mix.at(-1)).toThrow(/nonnegative/);
    expect(() => mix.at(300)).toThrow(/outside/);
  });
  test.each([
    [
      { plays: [{ title: 'A', at: 0, until: 10, contributions: [{ from: 0, until: 10 }] }] },
      /until conflicts/,
    ],
    [{ plays: [{ title: 'A', contributions: [] }] }, /at least one/],
    [
      {
        plays: [
          row('a', [
            [0, 20],
            [10, 30],
          ]),
        ],
      },
      /nonoverlapping/,
    ],
    [{ plays: [row('a', [[0, 20]]), row('a', [[20, 30]])] }, /duplicate IDs/],
    [{ plays: [{ title: 'A', at: 0, id: '$reserved' }] }, /reserved/],
    [{ plays: [{ recording: 'missing', at: 0 }] }, /reference does not exist/],
    [{ version: 2 }, /Unsupported mix version/],
    [{ annotations: [{ at: 0, kind: 'dropp' }] }, /namespaced/],
    [
      { annotations: [{ at: 0, kind: 'drop', scope: { plays: ['a'] }, participants: ['a'] }] },
      /participants requires/,
    ],
    [{ focus: [{ at: 0, plays: ['missing'] }] }, /reference does not exist/],
    [
      {
        focus: [
          { at: 0, plays: [] },
          { at: 0, plays: [] },
        ],
      },
      /duplicate times/,
    ],
    [
      {
        chapters: [
          { at: 0, title: 'A' },
          { at: 0, title: 'B' },
        ],
      },
      /duplicate times/,
    ],
  ])('rejects invalid authored data %#', (input, message) => rejects(input, message as RegExp));
  test('interval-query equivalence and segmentation neutrality across hundreds of boundaries', () => {
    const plays = Array.from({ length: 12 }, (_, index) =>
      row(`p${index}`, [
        [index * 3, index * 3 + 8],
        [100 + index, 120 + index],
      ]),
    );
    const mix = timeline({ plays });
    for (let time = 0; time < 150; time += 0.5) {
      expect(names(mix, time)).toEqual(
        plays.filter((play) => activeRow(play, time)).map((play) => play.id),
      );
    }
    const whole = timeline({ plays: [row('a', [[0, 300]])] });
    const segmented = timeline({
      plays: [
        row('a', [
          [0, 50],
          [50, 100],
          [100, 300],
        ]),
      ],
    });
    for (const time of [0, 49, 50, 99, 100, 299])
      expect(segmented.at(time).currentPlays[0]?.run).toEqual(whole.at(time).currentPlays[0]?.run);
  });
});

test('scoped history is queryable when a play is absent; metadata boundaries do not clear it', () => {
  const mix = timeline({
    plays: [
      row('a', [
        [0, 10],
        [20, 30],
      ]),
    ],
    annotations: [
      { at: 10, kind: 'rewind', scope: { plays: ['a'] } },
      { at: 0, until: 'end', kind: 'note', text: 'Whole mix' },
    ],
  });
  expect(lastAnnotations(mix.at(15), 'rewind', { play: 'a' })).toHaveLength(1);
  expect(mix.at(15).activeAnnotations[0]).toMatchObject({ until: 300_000_000 });
});

test('input ordering changes stable display order, never membership', () => {
  const plays = [
    row('a', [[0, 80]]),
    row('b', [
      [10, 20],
      [60, 90],
    ]),
    row('c', [[15, 85]]),
  ];
  const forward = timeline({ plays });
  const reverse = timeline({ plays: plays.toReversed() });
  for (let time = 0; time < 100; time++)
    expect(names(forward, time).sort()).toEqual(names(reverse, time).sort());
});

test('a play named mix is distinct from mix scope, and a timeline owns an immutable revision', () => {
  const document = normalizeMix(
    {
      plays: [{ id: 'mix', at: 0, title: 'Mix' }],
      annotations: [{ at: 10, kind: 'drop', scope: { plays: ['mix'] } }],
    },
    100,
  );
  const mix = new Timeline(document);
  document.contributions[0]!.until = 5_000_000;
  expect(names(mix, 20)).toEqual(['mix']);
  expect(lastAnnotations(mix.at(20), 'drop')).toEqual([]);
  expect(lastAnnotations(mix.at(20), 'drop', { play: 'mix' })).toHaveLength(1);
  expect(() => {
    mix.document.contributions[0]!.until = 1;
  }).toThrow();
});

test.each([
  { plays: [{ title: 'A', at: 0, contributions: [{ from: 0, until: null }] }] },
  { plays: [{ title: 'A', at: 0, contribtions: [] }] },
  { annotations: [{ at: 0, until: 1, kind: 'drop' }] },
  { annotations: [{ at: 0, kind: 'note' }] },
  { annotations: [{ at: 0, kind: 'technique', tags: [] }] },
  { annotations: [{ at: 0, kind: 'plugin:cue', data: { value: Infinity } }] },
  { sources: { note: { title: 'Note' } }, extensions: { typo: true } },
  { plays: [{ title: 'A', at: 0, evidence: ['missing'] }] },
])('rejects unfinished, misspelled or nonserializable input %#', (input) => {
  expect(() => normalizeMix(input, 100)).toThrow(ConfigError);
});

test('semantic errors identify authored rows before chronological sorting', () => {
  rejects(
    {
      annotations: [
        { at: 400, kind: 'drop' },
        { at: 0, kind: 'drop' },
      ],
    },
    /annotations\[0\]\.at.*400000000/,
  );
  rejects(
    {
      focus: [
        { at: 400, plays: [] },
        { at: 0, plays: [] },
      ],
    },
    /focus\[0\]\.at.*400000000/,
  );
  rejects(
    { plays: [{ title: 'A', at: 400, contributions: [{ from: 0, until: 10 }] }] },
    /plays\[0\]\.at.*400000000/,
  );
  rejects({ plays: [{ title: 'A', at: 0, evidence: ['missing'] }] }, /plays\[0\]\.evidence/);
  rejects({ plays: [row('a', [[0, 400]])] }, /plays\[0\]\.contributions\[0\]/);
});
