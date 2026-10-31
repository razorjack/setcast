import { expect, test } from 'vite-plus/test';
import { loadRemotion } from './optional-remotion.ts';

test('missing optional adapter has selection and installation advice', async () => {
  const cause = Object.assign(
    new Error("Cannot find package '@setcast/renderer-remotion' imported from cli.mjs"),
    { code: 'ERR_MODULE_NOT_FOUND' },
  );
  await expect(loadRemotion(() => Promise.reject(cause))).rejects.toMatchObject({
    message: 'The selected Remotion renderer is not installed.',
    hint: expect.stringContaining('alongside @setcast/cli'),
    cause,
  });
});

test('an installed adapter and its own failures are not replaced with missing-adapter advice', async () => {
  const adapter = { version: 1 };
  expect(await loadRemotion(() => Promise.resolve(adapter))).toBe(adapter);
  for (const error of [
    Object.assign(new Error("Cannot find package 'remotion' imported from adapter.mjs"), {
      code: 'ERR_MODULE_NOT_FOUND',
    }),
    new Error('Encoder initialization failed'),
    Object.assign(new Error('Package subpath is not defined'), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    }),
  ])
    await expect(loadRemotion(() => Promise.reject(error))).rejects.toBe(error);
});
