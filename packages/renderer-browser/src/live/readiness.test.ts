import { expect, test } from 'vite-plus/test';
import { LiveReadiness } from './readiness.ts';

test('scene holds are independent and release exactly once without controlling capture', () => {
  const readiness = new LiveReadiness();
  const image = readiness.hold('image');
  const fonts = readiness.hold('fonts');
  expect(readiness.ready).toBe(false);
  image();
  expect(readiness.ready).toBe(false);
  const revision = readiness.revision;
  image();
  expect(readiness.revision).toBe(revision);
  fonts();
  expect(readiness.ready).toBe(true);
});
