import { describe, expect, test, vi } from 'vite-plus/test';
import { ConfigError, SetcastError } from '@setcast/core';
import { clearSpinnerOnError, errorExitCode, formatDuration, printError } from './ui.ts';

test('formatDuration carries rounded seconds into the minute', () => {
  expect(formatDuration(45.2)).toBe('45s');
  expect(formatDuration(59.6)).toBe('1m 00s');
  expect(formatDuration(119.7)).toBe('2m 00s');
  expect(formatDuration(125)).toBe('2m 05s');
  expect(formatDuration(3700)).toBe('1h 01m 40s');
});

describe('clearSpinnerOnError', () => {
  test('leaves successful spinners alone', async () => {
    const spin = { clear: vi.fn() };
    await expect(clearSpinnerOnError(spin, async () => 1)).resolves.toBe(1);
    expect(spin.clear).not.toHaveBeenCalled();
  });

  test('clears active spinners before propagating failures', async () => {
    const spin = { clear: vi.fn() };
    await expect(
      clearSpinnerOnError(spin, async () => {
        throw new Error('render failed');
      }),
    ).rejects.toThrow('render failed');
    expect(spin.clear).toHaveBeenCalledOnce();
  });
});

test('usage and config errors use exit code 2; runtime errors use 1', () => {
  expect(errorExitCode(new SetcastError('bad flag'))).toBe(2);
  expect(errorExitCode(new ConfigError('setcast.yaml', []))).toBe(2);
  expect(errorExitCode(new SetcastError('browser failed', undefined, { exitCode: 1 }))).toBe(1);
  expect(errorExitCode(new Error('unexpected'))).toBe(1);
});

test('printError shows causes and full stacks in debug mode', () => {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const previous = process.env.SETCAST_DEBUG;
  process.env.SETCAST_DEBUG = '1';
  const cause = new Error('media parser failed');
  const error = new SetcastError('Cannot read mix.wav', 'Re-export it.', { cause });
  error.stack = `SetcastError: Cannot read mix.wav\n${Array.from({ length: 8 }, (_, index) => `    at setcast-${index}`).join('\n')}`;
  cause.stack = 'Error: media parser failed\n    at media-cause';

  try {
    printError(error);
    const output = write.mock.calls.map(([text]) => String(text)).join('');
    expect(output).toContain('caused by: media parser failed');
    expect(output).toContain('at setcast-7');
    expect(output).toContain('at media-cause');
  } finally {
    if (previous === undefined) delete process.env.SETCAST_DEBUG;
    else process.env.SETCAST_DEBUG = previous;
    write.mockRestore();
  }
});
