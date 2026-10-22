import { expect, test } from 'vite-plus/test';
import { ProjectionSchema, type Projection } from '@setcast/core';
import { projectionMatrix } from './projection-math.ts';

function transform(matrix: number[], x: number, y: number) {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[15]!;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[12]!) / w,
    (matrix[1]! * x + matrix[5]! * y + matrix[13]!) / w,
    w,
  ];
}

test('homography maps all four corners for landscape, portrait and non-affine shapes', () => {
  const shapes: Projection['corners'][] = [
    ProjectionSchema.parse({}).corners,
    [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ],
    [
      [0.1, 0.2],
      [0.8, 0],
      [1, 1],
      [0, 0.8],
    ],
  ];
  for (const [width, height] of [
    [1920, 1080],
    [1080, 1920],
    [800, 800],
  ] as const) {
    for (const corners of shapes) {
      const matrix = projectionMatrix(corners, width, height);
      const source = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ];
      for (let index = 0; index < 4; index++) {
        const [x, y, w] = transform(matrix, source[index]![0]!, source[index]![1]!);
        expect(x).toBeCloseTo(corners[index]![0] * width, 8);
        expect(y).toBeCloseTo(corners[index]![1] * height, 8);
        expect(w).toBeGreaterThan(0);
      }
    }
  }
});

test('identity preserves interior pixels, and projective edges remain straight', () => {
  const identity = projectionMatrix(ProjectionSchema.parse({}).corners, 1920, 1080);
  expect(transform(identity, 123, 456)).toEqual([123, 456, 1]);
  const matrix = projectionMatrix(
    [
      [0.1, 0.2],
      [0.8, 0],
      [1, 1],
      [0, 0.8],
    ],
    1000,
    1000,
  );
  const a = transform(matrix, 0, 0);
  const b = transform(matrix, 1000, 0);
  const mid = transform(matrix, 500, 0);
  expect((mid[0]! - a[0]!) * (b[1]! - a[1]!) - (mid[1]! - a[1]!) * (b[0]! - a[0]!)).toBeCloseTo(
    0,
    8,
  );
  expect(() => projectionMatrix(ProjectionSchema.parse({}).corners, 0, 100)).toThrow('dimensions');
  expect(() =>
    projectionMatrix(
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      100,
      100,
    ),
  ).toThrow('degenerate');
});
