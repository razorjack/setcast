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
const COMMENT = /\/\*[\s\S]*?\*\//g;
/** A scheme, a protocol-relative or absolute path, or a fragment: nothing on disk to inline. */
const ELSEWHERE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

const urlValue = (quoted?: string, bare?: string): string => (quoted ?? bare ?? '').trim();

/** Reads a stylesheet and inlines relative `url()` references as data URIs, so the CSS is self-contained. */
export async function loadCss(file: string): Promise<string> {
  const css = await readFile(file, 'utf8');
  const dir = dirname(file);

  const inlined = new Map<string, string>();
  for (const reference of localReferences(css)) {
    inlined.set(reference, await dataUri(resolve(dir, stripQuery(reference))));
  }

  return css.replace(URL_RE, (match, _quote, quoted: string, bare: string) => {
    const uri = inlined.get(urlValue(quoted, bare));
    return uri ? `url("${uri}")` : match;
  });
}

/** Each distinct `url()` that names a file next to the stylesheet. Commented-out ones don't count. */
function localReferences(css: string): Set<string> {
  const references = [...css.replace(COMMENT, '').matchAll(URL_RE)].map((match) =>
    urlValue(match[2], match[3]),
  );
  return new Set(references.filter((reference) => !ELSEWHERE.test(reference)));
}

async function dataUri(path: string): Promise<string> {
  const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const bytes = await readFile(path);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/** `fonts/x.woff2?v=2#hash` points at `fonts/x.woff2`; the rest is cache busting. */
const stripQuery = (reference: string) => reference.replace(/[?#].*$/, '');
