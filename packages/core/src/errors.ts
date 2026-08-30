import type { z } from 'zod';

/** An error with a user-facing message and what to do about it. The CLI prints both. */
export interface SetcastErrorOptions extends ErrorOptions {
  /** 2 for usage or project configuration, 1 for a runtime failure. */
  exitCode?: 1 | 2;
}

export class SetcastError extends Error {
  readonly hint: string | undefined;
  readonly exitCode: 1 | 2;
  constructor(message: string, hint?: string, options?: SetcastErrorOptions) {
    super(message, options);
    this.name = 'SetcastError';
    this.hint = hint;
    this.exitCode = options?.exitCode ?? 2;
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
  return error.issues.map((issue) => ({
    path: issue.path.reduce(appendPath, ''),
    message: issue.message,
  }));
}

function appendPath(path: string, segment: PropertyKey): string {
  if (typeof segment === 'number') return `${path}[${segment}]`;
  if (!path) return String(segment);
  return `${path}.${String(segment)}`;
}
