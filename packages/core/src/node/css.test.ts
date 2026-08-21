import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { loadCss } from './css.ts';

test('inlines file URLs without resolving comments, fragments, or schemes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-css-'));
  await mkdir(join(dir, 'fonts'));
  await writeFile(join(dir, 'fonts/x.woff2'), 'font');
  const file = join(dir, 'theme.css');
  await writeFile(
    file,
    [
      '/* url(missing.png) */',
      '@font-face { src: url(fonts/x.woff2) }',
      '.clip { clip-path: url(#shape) }',
      '.remote { background: url(blob:example) }',
    ].join('\n'),
  );

  const css = await loadCss(file);
  expect(css).toContain('data:font/woff2;base64,');
  expect(css).toContain('url(#shape)');
  expect(css).toContain('url(blob:example)');
});
