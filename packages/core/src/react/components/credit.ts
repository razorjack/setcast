import type { Recording } from '../../mix/mix-schema.ts';

/** A recording's label and version on one line; empty when it has neither. */
export const labelLine = (recording: Recording): string =>
  [recording.label, recording.version].filter(Boolean).join(' · ');
