import { z } from 'zod';
import { parseTime } from './time.ts';

export const TimeSchema = z
  .union([z.number(), z.string()], {
    error: 'Time must be seconds (83.5) or a timecode ("1:23").',
  })
  .transform((written, ctx) => {
    const seconds = parseTime(written);
    if (seconds === null) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid time "${written}". Use seconds (83.5) or a timecode ("1:23", "1:23.5", "1:02:03").`,
      });
      return z.NEVER;
    }
    return seconds;
  });
