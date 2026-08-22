import { describe, expect, test, vi } from 'vite-plus/test';
import { clearSpinnerOnError, fmtSeconds } from './ui.ts';

test('fmtSeconds carries rounded seconds into the minute', () => {
  expect(fmtSeconds(45.2)).toBe('45s');
  expect(fmtSeconds(59.6)).toBe('1m 00s');
  expect(fmtSeconds(119.7)).toBe('2m 00s');
  expect(fmtSeconds(125)).toBe('2m 05s');
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

  test('does not clear a spinner that has already stopped', async () => {
    const spin = { clear: vi.fn() };
    await expect(
      clearSpinnerOnError(
        spin,
        async () => {
          throw new Error('encode failed');
        },
        () => false,
      ),
    ).rejects.toThrow('encode failed');
    expect(spin.clear).not.toHaveBeenCalled();
  });
});
