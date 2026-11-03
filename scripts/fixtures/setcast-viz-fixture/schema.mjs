import { z } from 'zod';

export default {
  apiVersion: 1,
  visualizer: {
    name: 'fixture-marker',
    audio: false,
    schema: z.strictObject({
      name: z.literal('fixture-marker'),
      label: z.string({ error: 'label must be text. Supply a quoted label.' }).default('External'),
      image: z.string().optional(),
    }),
  },
  assets: ['image'],
};
