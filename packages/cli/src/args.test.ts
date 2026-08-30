import { expect, test } from 'vite-plus/test';
import { parseCommandArgs } from './args.ts';

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
