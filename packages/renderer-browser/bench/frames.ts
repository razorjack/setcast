import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import type { ResolvedProject } from '@setcast/core';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { createVideo } from '../../../scripts/export-acceptance/video.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const directory = await mkdtemp(join(tmpdir(), 'setcast-frame-order-'));
const font = await readFile(
  new URL('../../themes/fonts/Silkscreen-400-latin.woff2', import.meta.url),
);
let requested = 0;
const server = createServer(async (_request, response) => {
  requested++;
  await setTimeout(500);
  response.writeHead(200, { 'Content-Type': 'font/woff2', 'Access-Control-Allow-Origin': '*' });
  response.end(font);
});
server.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await createFixture(directory);
  const project = await fixtureProject(directory, 'sterile-tech');
  await withRenderSession(async () => {
    await checkScenes(project, `http://127.0.0.1:${address.port}/font.woff2`);
    assert(requested > 0, 'Scene font was never requested');
    await checkVideo(project);
  });
  process.stdout.write(
    'Frame driver: PASS (same-page backward seeks, scene font changes, video loops)\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
}

async function checkScenes(project: ResolvedProject, font: string) {
  const scene = {
    ...project,
    audio: null,
    mix: null,
    panel: null,
    tracklist: null,
    title: 'Scene with loaded font',
    css: `${project.css}\n@font-face {font-family: ReplayFont; src: url('${font}');}\n.sc-set-title {font-family: ReplayFont;}`,
    live: { clock: false, input: { channels: null, gain: 1, delay: 0 } },
  };
  await withCapture(
    { ...project, scenes: [{ at: 1, scene }] },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 12);
      assert.equal(await page.locator('.sc-set-title').textContent(), project.title);
      await prepareFrame(page, 51);
      assert.equal(await page.locator('.sc-set-title').textContent(), scene.title);
      assert(await page.evaluate(() => document.fonts.check('16px ReplayFont')));
      const later = await page.screenshot();
      await prepareFrame(page, 12);
      assert.equal(await page.locator('.sc-set-title').textContent(), project.title);
      await prepareFrame(page, 51);
      assert(later.equals(await page.screenshot()), 'Scene rendering depends on frame order');
    },
  );
}

async function checkVideo(project: ResolvedProject) {
  createVideo(join(directory, 'loop.mp4'));
  const css = `${project.css}\n.setcast > :not(style):not(.sc-bg) {display:none;}`;
  await withCapture(
    { ...project, css, background: 'loop.mp4', visualizers: [] },
    { projectDir: directory },
    async (page) => {
      const images: Buffer[] = [];
      for (const frame of [37, 22, 7]) {
        await prepareFrame(page, frame);
        images.push(await page.screenshot());
      }
      assert(images[0]!.equals(images[2]!), 'Video loop differs after a backward seek in one page');
      assert(!images[0]!.equals(images[1]!), 'Different video timestamps rendered the same image');
    },
  );
}
