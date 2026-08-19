import { describe, expect, test } from 'vite-plus/test';
import { formatChapterTime, formatTime, parseTime } from './time.ts';

describe('parseTime', () => {
  test('accepts seconds, MM:SS, and H:MM:SS', () => {
    expect(parseTime(83.5)).toBe(83.5);
    expect(parseTime('83.5')).toBe(83.5);
    expect(parseTime('1:23')).toBe(83);
    expect(parseTime('01:23.5')).toBe(83.5);
    expect(parseTime('1:02:03')).toBe(3723);
  });

  test('rejects garbage and negatives', () => {
    expect(parseTime('drop')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
    expect(parseTime(-1)).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

test('formatTime and formatChapterTime', () => {
  expect(formatTime(83)).toBe('1:23');
  expect(formatTime(3723)).toBe('1:02:03');
  expect(formatChapterTime(83)).toBe('01:23');
  expect(formatChapterTime(3723)).toBe('01:02:03');
});
