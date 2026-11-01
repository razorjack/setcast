import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  BrandingSchema,
  type Exporter,
  type ResolvedProject,
} from '../../packages/core/src/index.ts';
import { decode, pixels } from './measure.ts';

export interface AcceptanceContext {
  exporter: Exporter;
  project: ResolvedProject;
  projectDir: string;
  out: string;
}

export async function checkArtTransition({
  exporter,
  project,
  projectDir,
  out,
}: AcceptanceContext) {
  for (const color of ['red', 'blue'])
    await writeFile(
      join(projectDir, `${color}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${color}"/></svg>`,
    );
  const scene = {
    ...project,
    width: 1080,
    height: 1920,
    backgroundFit: 'contain' as const,
    mix: {
      ...project.mix,
      plays: project.mix.plays.map((play, index) => ({
        ...play,
        background: index === 0 ? 'red.svg' : 'blue.svg',
      })),
    },
    css: `${project.css}\n.sc-bg { display: block !important; position: absolute; inset: 0; }
.sc-bg-img { width: 100%; height: 100%; } .setcast::after { display: none; }`,
  };
  const file = join(out, 'art-transition.mp4');
  await exporter.render(scene, { projectDir, out: file, range: [1, 2], concurrency: 1 });
  const centers = decode(file, [
    '-vf',
    'crop=2:2:540:960,scale=1:1',
    '-an',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
  ]);
  assert.equal(centers.length, 30 * 3);
  for (let frame = 0; frame < 30; frame++) {
    const red = centers[frame * 3]!,
      blue = centers[frame * 3 + 2]!;
    assert(
      frame < 15 ? red > 220 && blue < 20 : blue > 220 && red < 20,
      `Art transition frame ${frame}: expected ${frame < 15 ? 'red' : 'blue'}, got red=${red}, blue=${blue}`,
    );
  }
  console.log('  art change: every decoded frame contains the expected prepared background');
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
    const logo = path.endsWith('.svg');
    response.writeHead(200, {
      'Content-Type': logo ? 'image/svg+xml' : 'font/woff2',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    response.end(logo ? LOGO : font);
  });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    await compareAssets(context, url);
    await compareLogo(context, url);
    for (const prefix of ['fast', 'slow']) {
      assert(requests.has(`/${prefix}/font.woff2`), `Font never requested: ${prefix}`);
      assert(requests.has(`/${prefix}/logo.svg`), `Logo never requested: ${prefix}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  console.log(
    '  delayed font and logo match loaded ones; image, font and logo differ from missing-asset controls',
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

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="200" height="200"><circle cx="5" cy="5" r="4" fill="#f80"/></svg>';

/** A branding logo served late must still be in the captured frame: the Img wrapper holds it. */
async function compareLogo(context: AcceptanceContext, url: string): Promise<void> {
  const { exporter, projectDir, out, project } = context;
  const captures: Buffer[] = [];
  for (const prefix of ['fast', 'slow', 'none']) {
    const outFile = join(out, `logo-${prefix}.png`);
    const branding =
      prefix === 'none'
        ? null
        : BrandingSchema.parse({ logo: `${url}/${prefix}/logo.svg`, position: 'center', size: 3 });
    const css = `${project.css}\n.setcast > .sc-brand-identity { display: flex; }`;
    await exporter.still({ ...project, branding, css }, { projectDir, out: outFile, at: 1.7 });
    captures.push(pixels(outFile));
  }
  assert(captures[0]!.equals(captures[1]!), 'Delayed logo changed captured pixels');
  assert(!captures[0]!.equals(captures[2]!), 'Logo check must distinguish the logo from none');
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
