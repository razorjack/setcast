import { describe, expect, test, vi } from 'vite-plus/test';
import { clearSpinnerOnError } from './ui.ts';

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
