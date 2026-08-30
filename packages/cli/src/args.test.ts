import { expect, test } from 'vite-plus/test';
import { parseCommandArgs, rangeWithinAudio, timeWithinAudio } from './args.ts';

const help = 'setcast render [dir] [--range START-END]';
const options = { range: { type: 'string' } } as const;

test('parseCommandArgs translates Node argument errors', () => {
  expect(() => parseCommandArgs(['--foo'], options, help)).toThrow(
    'Unknown option --foo for setcast render',
  );
  expect(() => parseCommandArgs(['--range'], options, help)).toThrow(
    'Option --range requires a value for setcast render',
  );
});

test('audio bounds reject starts past the set and clip range ends', () => {
  expect(timeWithinAudio(30, 90, '--at')).toBe(30);
  expect(() => timeWithinAudio(90, 90, '--at')).toThrow('--at 1:30 is after the set ends at 1:30');
  expect(rangeWithinAudio([60, 120], 90, 'Render range')).toEqual([60, 90]);
  expect(() => rangeWithinAudio([100, 120], 90, 'Render range')).toThrow(
    'Render range starts at 1:40 is after the set ends at 1:30',
  );
});
