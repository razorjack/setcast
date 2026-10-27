import { expect, test } from 'vite-plus/test';
import { ProjectionSchema, VenueSchema } from './projection.ts';
import { LiveConfigSchema } from './live-config.ts';

test('projection defaults are opt-in and live config preserves validated geometry', () => {
  const defaults = ProjectionSchema.parse({});
  expect(defaults.enabled).toBe(false);
  expect(defaults.corners).toEqual([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
  expect(LiveConfigSchema.parse({}).projection).toBeUndefined();
  expect(LiveConfigSchema.parse({ projection: { enabled: true } }).projection).toEqual({
    ...defaults,
    enabled: true,
  });
});

test('rejects crossed, concave, reversed, collapsed and nonfinite projection corners', () => {
  for (const corners of [
    [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0.2, 0.2],
      [0, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, 0],
      [Infinity, 0],
      [1, 1],
      [0, 1],
    ],
  ])
    expect(ProjectionSchema.safeParse({ corners }).success).toBe(false);
  expect(
    ProjectionSchema.safeParse({
      corners: [
        [0.1, 0.2],
        [0.8, 0],
        [1, 1],
        [0, 0.8],
      ],
    }).success,
  ).toBe(true);
});

test('crop leaves useful area and output masks stay bounded', () => {
  expect(() => ProjectionSchema.parse({ crop: { left: 0.5, right: 0.46 } })).toThrow(
    'Reduce opposing edges',
  );
  expect(ProjectionSchema.safeParse({ crop: { top: 0.95 } }).success).toBe(true);
  const mask = { left: 0.1, top: 0.2, width: 0.3, height: 0.4 };
  expect(ProjectionSchema.safeParse({ masks: [mask] }).success).toBe(true);
  for (const masks of [[{ ...mask, width: 0 }], [{ ...mask, left: 0.8 }], Array(9).fill(mask)])
    expect(ProjectionSchema.safeParse({ masks }).success).toBe(false);
});

test('venue files exclude transient show controls and reject unknown versions', () => {
  const venue = { version: 1, name: '  Warehouse  ', projection: {} };
  expect(VenueSchema.parse(venue).name).toBe('Warehouse');
  expect(() => VenueSchema.parse({ ...venue, version: 2 })).toThrow('Export a version 1 venue');
  for (const invalid of [
    { ...venue, version: 2 },
    { ...venue, name: ' ' },
    { ...venue, pattern: true },
    { ...venue, projection: { brightness: 0 } },
  ])
    expect(VenueSchema.safeParse(invalid).success).toBe(false);
});
