import { describe, expect, test } from 'vite-plus/test';
import { formatChapterTime, formatTime, formatTimecode, parseTime } from './time.ts';

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
    expect(parseTime('1:99')).toBeNull();
    expect(parseTime('1:60:00')).toBeNull();
    expect(parseTime('1:02:99')).toBeNull();
  });
});

test('formatTime and formatChapterTime', () => {
  expect(formatTime(83)).toBe('1:23');
  expect(formatTime(3723)).toBe('1:02:03');
  expect(formatChapterTime(83)).toBe('01:23');
  expect(formatChapterTime(3723)).toBe('01:02:03');
});

test('formatTimecode keeps the fraction', () => {
  expect(formatTimecode(83)).toBe('1:23');
  expect(formatTimecode(83.5)).toBe('1:23.5');
  expect(formatTimecode(33.104)).toBe('0:33.104');
  expect(formatTimecode(3723.25)).toBe('1:02:03.25');
});
