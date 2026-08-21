import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const URL_RE = /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi;
const urlValue = (quoted?: string, bare?: string): string => (quoted ?? bare ?? '').trim();

/** Reads a stylesheet and inlines relative `url()` references as data URIs, so the CSS is self-contained. */
export async function loadCss(file: string): Promise<string> {
  const css = await readFile(file, 'utf8');
  const dir = dirname(file);
  const refs = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(URL_RE)]
    .map((match) => urlValue(match[2], match[3]))
    .filter((u) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(u));
  const data = new Map<string, string>();
  for (const ref of new Set(refs)) {
    const fileRef = ref.replace(/[?#].*$/, '');
    const path = resolve(dir, fileRef);
    const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    data.set(ref, `data:${mime};base64,${(await readFile(path)).toString('base64')}`);
  }
  return css.replace(URL_RE, (match, _quote, quoted: string, bare: string) => {
    const ref = urlValue(quoted, bare);
    return data.has(ref) ? `url("${data.get(ref)}")` : match;
  });
}
