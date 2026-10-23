import { dirname, join, sep } from 'node:path';
import { ConfigError, SetcastError } from '../errors.ts';
import type { ValidationDiagnostic } from './validate.ts';

export function validationFailure(
  error: unknown,
  file: string,
): { exitCode: 1 | 2; diagnostics: ValidationDiagnostic[] } {
  if (error instanceof ConfigError) {
    const physical = error.file.endsWith('.yaml');
    const source = physical ? join(dirname(file), error.file).split(sep).join('/') : file;
    return {
      exitCode: 2,
      diagnostics: error.issues.map((issue) => ({
        level: 'error',
        code: 'configuration',
        file: source,
        ...issue,
        hint: error.hint,
        context: error.file,
      })),
    };
  }
  const filesystem = error instanceof Error && 'code' in error && typeof error.code === 'string';
  let exitCode: 1 | 2 = filesystem && error.code === 'ENOENT' ? 2 : 1;
  let code: ValidationDiagnostic['code'] = filesystem ? 'io' : 'runtime';
  if (error instanceof SetcastError) {
    exitCode = error.exitCode;
    code = 'project';
  }
  return {
    exitCode,
    diagnostics: [
      {
        level: 'error',
        code,
        file,
        path: '',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof SetcastError && error.hint ? { hint: error.hint } : {}),
      },
    ],
  };
}
