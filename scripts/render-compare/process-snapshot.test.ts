import { expect, test } from 'vite-plus/test';
import { cpuSeconds, descendants, parseProcesses, processDelta } from './process-snapshot.ts';

test('ps CPU times cover macOS and Linux durations without dropping days', () => {
  expect(cpuSeconds('0:00.02')).toBe(0.02);
  expect(cpuSeconds('123:45.67')).toBe(7425.67);
  expect(cpuSeconds('01:23:45')).toBe(5025);
  expect(cpuSeconds('2-01:23:45')).toBe(177825);
  for (const invalid of ['-1:23', 'unknown', '1:60', '1:60:00'])
    expect(() => cpuSeconds(invalid)).toThrow();
});

const started = 'Thu Oct 29 17:47:37 2026';
const row = (pid: number, parent: number, rss: number, cpu: string) =>
  `${pid} ${parent} ${rss} ${cpu} ${started}`;

test('process trees include grandchildren independently of ps row order and exclude neighbors', () => {
  const rows = parseProcesses(
    [
      row(3, 2, 30, '0:00'),
      row(4, 1, 40, '0:00'),
      row(2, 10, 20, '0:00'),
      row(10, 1, 10, '0:00'),
    ].join('\n'),
  );
  expect([...descendants(rows, 10)].sort((a, b) => a - b)).toEqual([2, 3, 10]);
  expect(processDelta(new Map(), rows, 10)).toEqual({
    treeCpuSeconds: 0,
    externalCpuSeconds: 0,
    rssBytes: 60 * 1024,
  });
});

test('deltas separate external CPU, ignore reused PIDs and omit new or exited work', () => {
  const before = parseProcesses(
    [
      row(10, 1, 10, '0:01'),
      row(2, 10, 20, '0:02'),
      row(3, 2, 30, '0:03'),
      row(4, 1, 40, '0:04'),
      row(5, 10, 50, '0:05'),
      row(6, 1, 60, '0:06'),
    ].join('\n'),
  );
  const after = parseProcesses(
    [
      row(10, 1, 10, '0:01.5'),
      row(2, 10, 20, '0:03'),
      row(3, 1, 30, '0:03.5'),
      row(4, 1, 40, '0:06'),
      row(6, 1, 60, '0:09').replace(started, 'Fri Oct 30 17:47:37 2026'),
      row(7, 10, 70, '0:02'),
    ].join('\n'),
  );
  expect(processDelta(before, after, 10)).toEqual({
    treeCpuSeconds: 2,
    externalCpuSeconds: 2,
    rssBytes: 100 * 1024,
  });
});

test('malformed snapshots fail explicitly instead of reporting zero renderer memory', () => {
  for (const invalid of ['', 'permission denied', '10 1 ? 0:01 started', row(10, 1, 10, 'oops')])
    expect(() => parseProcesses(invalid)).toThrow();
  expect(() => parseProcesses([row(1, 0, 1, '0:00'), row(1, 0, 1, '0:00')].join('\n'))).toThrow();
});
