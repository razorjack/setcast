import type { z } from 'zod';

/** An error with a user-facing message and what to do about it. The CLI prints both. */
export class SetcastError extends Error {
  readonly hint: string | undefined;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'SetcastError';
    this.hint = hint;
  }
}

export interface Issue {
  path: string;
  message: string;
}

export class ConfigError extends SetcastError {
  readonly file: string;
  readonly issues: Issue[];
  constructor(file: string, issues: Issue[]) {
    super(
      `${file} has ${issues.length} problem${issues.length === 1 ? '' : 's'}`,
      'Fix the entries above and run again. See the setcast.yaml reference in README.md.',
    );
    this.name = 'ConfigError';
    this.file = file;
    this.issues = issues;
  }
}

/** Flattens Zod issues into `{ path: 'tracks[2].time', message }` pairs. */
export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({
    path: i.path.reduce<string>(
      (acc, k) =>
        typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k),
      '',
    ),
    message: i.message,
  }));
}
