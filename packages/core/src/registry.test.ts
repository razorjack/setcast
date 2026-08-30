import { expect, test } from 'vite-plus/test';
import { Registry } from './registry.ts';

test('replace only updates a registered name', () => {
  const registry = new Registry<{ name: string; version: number }>('widget');

  expect(() => registry.replace({ name: 'meter', version: 1 })).toThrow(
    'Cannot replace unknown widget "meter"',
  );
  registry.add({ name: 'meter', version: 1 });
  registry.replace({ name: 'meter', version: 2 });
  expect(registry.get('meter').version).toBe(2);
});
