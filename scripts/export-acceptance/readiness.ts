import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import type { Exporter, ResolvedProject } from '../../packages/core/src/index.ts';
import { pixels } from './measure.ts';

export interface AcceptanceContext {
  exporter: Exporter;
  project: ResolvedProject;
  projectDir: string;
  out: string;
}

export async function checkReadiness(context: AcceptanceContext): Promise<void> {
  const font = await readFile(
    new URL('../../packages/themes/fonts/Silkscreen-400-latin.woff2', import.meta.url),
  );
  const requests = new Set<string>();
  const server = createServer(async (request, response) => {
    const path = request.url ?? '';
    requests.add(path);
    if (path.startsWith('/slow/')) await setTimeout(900);
    response.writeHead(200, {
      'Content-Type': 'font/woff2',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    response.end(font);
  });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    await compareAssets(context, url);
    for (const prefix of ['fast', 'slow']) {
      assert(requests.has(`/${prefix}/font.woff2`), `Font never requested: ${prefix}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  console.log(
    '  delayed font matches loaded font; image and font differ from missing-asset controls',
  );
}

async function compareAssets(context: AcceptanceContext, url: string): Promise<void> {
  const { exporter, projectDir, out, project } = context;
  const results: Buffer[] = [];
  for (const prefix of ['fast', 'slow']) {
    const outFile = join(out, `assets-${prefix}.png`);
    await exporter.still(
      { ...project, background: 'art.svg', css: assetCss(`${url}/${prefix}`) },
      { projectDir, out: outFile, at: 1.7 },
    );
    results.push(pixels(outFile));
  }
  assert(results[0]!.equals(results[1]!), 'Delayed assets changed captured pixels');
  const control = join(out, 'assets-fallback-font.png');
  await exporter.still(
    {
      ...project,
      background: 'art.svg',
      css: assetCss(`${url}/fast`).replace('font-family: Acceptance', 'font-family: monospace'),
    },
    { projectDir, out: control, at: 1.7 },
  );
  assert(
    !results[0]!.equals(pixels(control)),
    'Font check must distinguish the intended font from fallback',
  );
  const blank = join(out, 'assets-no-image.png');
  await exporter.still(
    { ...project, background: null, css: assetCss(`${url}/fast`) },
    { projectDir, out: blank, at: 1.7 },
  );
  assert(
    !results[0]!.equals(pixels(blank)),
    'Image check must distinguish loaded art from missing art',
  );
}

function assetCss(url: string): string {
  return `
@font-face { font-family: Acceptance; src: url('${url}/font.woff2'); font-display: swap; }
body { margin: 0; }
.setcast { position: relative; overflow: hidden; background: black; color: white; }
.sc-bg { position: absolute; inset: 0; }
.sc-bg-img { width: 100%; height: 100%; object-fit: cover; }
.sc-art, .sc-contributors, .sc-next, .sc-clock { display: none; }
.sc-header { position: absolute; left: 32px; top: 32px; font-family: Acceptance; font-size: 32px; }
`;
}
