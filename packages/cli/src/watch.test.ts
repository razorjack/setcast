import { afterEach, expect, test, vi } from 'vite-plus/test';

const files = vi.hoisted(() => ({ watchFile: vi.fn(), unwatchFile: vi.fn() }));
vi.mock('node:fs', () => files);
import { watchInputs } from './watch.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('debounces edits, watches failed dependencies, recovers, and cleans up', async () => {
  vi.useFakeTimers();
  let valid = false;
  const reload = vi.fn(async (dependencies: Set<string>) => {
    dependencies.add('setcast.yaml');
    dependencies.add('new.css');
    if (!valid) throw new Error('Invalid CSS');
  });
  const error = vi.fn();
  const stop = watchInputs(new Set(['setcast.yaml', 'old.css']), reload, error);
  const changed = files.watchFile.mock.calls[0]![2] as () => void;
  changed();
  changed();
  await vi.advanceTimersByTimeAsync(100);
  expect(reload).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
  expect(files.watchFile).toHaveBeenCalledWith('new.css', { interval: 200 }, changed);
  expect(files.unwatchFile).not.toHaveBeenCalled();
  valid = true;
  changed();
  await vi.advanceTimersByTimeAsync(100);
  expect(files.unwatchFile).toHaveBeenCalledWith('old.css', changed);
  changed();
  await stop();
  await vi.advanceTimersByTimeAsync(100);
  expect(reload).toHaveBeenCalledTimes(2);
  expect(files.unwatchFile).toHaveBeenCalledWith('new.css', changed);
});
