import { z } from 'zod';

const fraction = z
  .number({ error: 'Use a finite projection coordinate from 0 to 1.' })
  .min(0, { error: 'Projection coordinates must be at least 0.' })
  .max(1, { error: 'Projection coordinates must be at most 1.' });
const point = z.tuple([fraction, fraction], {
  error: 'A projection corner must be [x, y], each from 0 to 1.',
});
export type ProjectionPoint = [number, number];

function convex(corners: ProjectionPoint[]) {
  let area = 0;
  for (let index = 0; index < 4; index++) {
    const [x, y] = corners[index]!;
    const [nextX, nextY] = corners[(index + 1) % 4]!;
    const [lastX, lastY] = corners[(index + 2) % 4]!;
    const cross = (nextX - x) * (lastY - nextY) - (nextY - y) * (lastX - nextX);
    if (cross < 0.0001) return false;
    area += x * nextY - nextX * y;
  }
  return area >= 0.02;
}

const crop = z
  .strictObject({
    top: fraction.default(0),
    right: fraction.default(0),
    bottom: fraction.default(0),
    left: fraction.default(0),
  })
  .refine((edges) => edges.left + edges.right <= 0.95 && edges.top + edges.bottom <= 0.95, {
    error: 'Projection crop must leave at least 5% of the width and height. Reduce opposing edges.',
  });
const mask = z
  .strictObject({
    left: fraction,
    top: fraction,
    width: fraction.min(0.001, { error: 'A mask width must be at least 0.001.' }),
    height: fraction.min(0.001, { error: 'A mask height must be at least 0.001.' }),
  })
  .refine((rect) => rect.left + rect.width <= 1 && rect.top + rect.height <= 1, {
    error:
      'Projection mask extends beyond the output. Reduce its position or size to fit inside 0–1.',
  });

export const ProjectionSchema = z.strictObject({
  enabled: z.boolean({ error: 'projection.enabled must be true or false.' }).default(false),
  corners: z
    .tuple([point, point, point, point], {
      error: 'Use four corners in order: top-left, top-right, bottom-right, bottom-left.',
    })
    .refine(convex, {
      error:
        'Projection corners must form a clockwise convex shape covering at least 1% of the output. Uncross or separate the corners.',
    })
    .default([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]),
  crop: crop.prefault({}),
  masks: z
    .array(mask, { error: 'projection.masks must be a list of rectangles.' })
    .max(8, { error: 'Use at most eight projection masks.' })
    .default([]),
});
export type Projection = z.infer<typeof ProjectionSchema>;

export const VenueSchema = z.strictObject({
  version: z.literal(1, {
    error: 'Unsupported venue format. Export a version 1 venue from Setcast.',
  }),
  name: z
    .string({ error: 'Give the venue a name.' })
    .trim()
    .min(1, { error: 'Give the venue a nonempty name.' })
    .max(80, { error: 'Keep venue names to at most 80 characters.' }),
  projection: ProjectionSchema,
});
export type Venue = z.infer<typeof VenueSchema>;
