import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { loadCss } from './css.ts';

test('inlines file URLs without resolving comments, fragments, or schemes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-css-'));
  await mkdir(join(dir, 'fonts'));
  await writeFile(join(dir, 'fonts/x.woff2'), 'font');
  await writeFile(join(dir, 'fonts/cover (final).png'), 'image');
  const file = join(dir, 'theme.css');
  await writeFile(
    file,
    [
      '/* url(missing.png) */',
      '@font-face { src: url(fonts/x.woff2) }',
      '.art { background: URL("fonts/cover (final).png?v=2#cover") }',
      '.clip { clip-path: url(#shape) }',
      '.remote { background: url(blob:example) }',
      '.data { background: url("data:image/svg+xml,<svg viewBox=(0)></svg>") }',
    ].join('\n'),
  );

  const css = await loadCss(file);
  expect(css).toContain('data:font/woff2;base64,');
  expect(css).toContain('data:image/png;base64,');
  expect(css).toContain('url(#shape)');
  expect(css).toContain('url(blob:example)');
  expect(css).toContain('data:image/svg+xml,<svg viewBox=(0)></svg>');
});

test('names a missing file referenced by the stylesheet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-css-'));
  const file = join(dir, 't.css');
  await writeFile(file, '@font-face { src: url(nope.woff2) }');

  await expect(loadCss(file)).rejects.toMatchObject({
    message: 't.css references nope.woff2, which does not exist',
    hint: `url() paths are relative to the stylesheet. Expected it at ${join(dir, 'nope.woff2')}.`,
    cause: expect.objectContaining({ code: 'ENOENT' }),
  });
});
