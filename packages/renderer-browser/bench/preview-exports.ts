import assert from 'node:assert/strict';
import { get } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rename, unlink, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { preview } from '../src/preview/server.ts';
import type { PreviewExportJob, PreviewExportsState } from '../src/preview/jobs-contract.ts';
import { render } from '../src/export/index.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY to retain preview export evidence.');
const root = resolve(values.out);
await mkdir(root);
const directory = join(root, 'fixture');
await mkdir(directory);
await createFixture(directory);
const project = await fixtureProject(directory, 'sterile-tech');
const outputs = join(root, 'exports');
const server = await preview(project, {
  projectDir: directory,
  port: 0,
  exports: { directory: outputs, settings: { chunkSeconds: 1 } },
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const origin = new URL(server.url).origin;
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
const results: Record<string, unknown> = {};
let closed = false;
try {
  await page.goto(server.url);
  await page.locator('[data-ready-frame="0"]').waitFor();
  await checkRequests();
  await page.getByLabel('In frame', { exact: true }).fill('32');
  await page.getByLabel('Out frame', { exact: true }).fill('94');
  await page.getByRole('button', { name: 'Export selected range' }).click();
  await page.locator('[data-export-status="complete"]').waitFor({ timeout: 60_000 });
  const first = (await state()).jobs[0]!;
  assert.equal(first.status, 'complete');
  const file = join(outputs, first.filename);
  const reference = join(root, 'reference.mp4');
  await render(project, {
    projectDir: directory,
    out: reference,
    range: [32 / 30, 95 / 30],
    chunkSeconds: 1,
  });
  assert.equal(decoded(file, '0:v'), decoded(reference, '0:v'));
  assert.equal(decoded(file, '0:a'), decoded(reference, '0:a'));
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
      encoding: 'utf8',
    }),
  );
  assert.equal(
    probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video').nb_frames,
    '63',
  );
  const download = await fetch(`${origin}/exports/${first.id}/file`);
  assert.equal(download.status, 200);
  assert(Buffer.from(await download.arrayBuffer()).equals(await readFile(file)));
  await rename(file, `${file}.saved`);
  await symlink(reference, file);
  assert.equal((await fetch(`${origin}/exports/${first.id}/file`)).status, 400);
  await unlink(file);
  await rename(`${file}.saved`, file);
  results.exactRange = {
    first: first.first,
    last: first.last,
    decodedFrames: 63,
    referenceVideo: 'equal',
    referenceAudio: 'equal',
  };
  await page.screenshot({ path: join(root, 'desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(root, 'narrow.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await checkCancellation();
  await checkRevision();
  await checkShutdown();
  assert.deepEqual(errors, []);
  await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2));
  process.stdout.write(
    'Preview exports: PASS (UI, exact range, decoded parity, request isolation, cancellation/resume, revision invalidation, shutdown)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(root, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (!closed) await server.close();
}
async function state(): Promise<PreviewExportsState> {
  return (await fetch(`${origin}/exports`)).json();
}
async function post(path: string, body: unknown = {}) {
  const { token } = await state();
  return fetch(`${origin}/exports${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Setcast-Export': token },
    body: JSON.stringify(body),
  });
}
async function enqueue(revision = 0) {
  const response = await post('', { revision, first: 0, last: 94 });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as PreviewExportJob;
}
async function waitForJob(id: string, predicate: (job: PreviewExportJob) => boolean) {
  for (let attempt = 0; attempt < 1200; attempt++) {
    const job = (await state()).jobs.find((job) => job.id === id)!;
    if (predicate(job)) return job;
    if (job.status === 'failed') throw new Error(JSON.stringify(job));
    await setTimeout(50);
  }
  throw new Error(`Timed out waiting for export ${id}`);
}
async function checkRequests() {
  const payload = { revision: 0, first: 0, last: 94 };
  const { token } = await state();
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: 'https://unrelated.example', 'X-Setcast-Export': token },
    { Origin: origin, 'X-Setcast-Export': 'wrong' },
    { Origin: origin },
    { 'X-Setcast-Export': token },
  ];
  for (const headers of rejectedHeaders) {
    const response = await fetch(`${origin}/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 403);
  }
  assert.equal(
    (await fetch(`${origin}/exports`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
    403,
  );
  assert.equal(await foreignHostStatus(), 403);
  for (const body of [
    { ...payload, out: '../overwrite.mp4' },
    { ...payload, revision: -1 },
    { ...payload, last: 95 },
    { ...payload, first: -1 },
    [],
  ])
    assert.equal((await post('', body)).status, 400);
  assert.equal((await fetch(`${origin}/exports`, { method: 'OPTIONS' })).status, 405);
  assert.equal((await fetch(`${origin}/save`, { method: 'POST' })).status, 405);
  assert.equal((await post('', { padding: 'x'.repeat(5000) })).status, 400);
  assert.equal((await state()).jobs.length, 0);
  results.requests =
    'Cross-origin, missing/wrong token, foreign Host, stale revision, path injection and invalid ranges rejected without jobs';
}
async function checkCancellation() {
  const job = await enqueue();
  const queued = await enqueue();
  assert.equal((await post(`/${queued.id}/cancel`)).status, 200);
  await waitForJob(queued.id, (job) => job.status === 'cancelled');
  await waitForJob(job.id, (job) => (job.progress?.renderedFrames ?? 0) >= 35);
  await page
    .locator(`[data-export-id="${job.id}"]`)
    .getByRole('button', { name: 'Cancel export' })
    .click();
  await waitForJob(job.id, (job) => job.status === 'cancelled');
  const checkpoint = `${join(outputs, job.filename)}.setcast-resume`;
  assert((await readdir(checkpoint)).includes('manifest.json'));
  await page
    .locator(`[data-export-id="${job.id}"]`)
    .getByRole('button', { name: 'Resume export' })
    .click();
  const resumed = await waitForJob(job.id, (job) => job.status === 'complete');
  assert((resumed.progress?.reusedFrames ?? 0) >= 30, 'Resume did not reuse a completed chunk');
  results.resume = { reusedFrames: resumed.progress?.reusedFrames, filename: resumed.filename };
}
async function checkRevision() {
  const active = await enqueue();
  const queued = await enqueue();
  await waitForJob(active.id, (job) => (job.progress?.renderedFrames ?? 0) >= 2);
  server.update({ ...project, title: 'Changed project' });
  await waitForJob(active.id, (job) => job.status === 'cancelled');
  await waitForJob(queued.id, (job) => job.status === 'cancelled');
  assert.equal((await post(`/${active.id}/resume`)).status, 400);
  assert.equal((await post('', { revision: 0, first: 0, last: 10 })).status, 400);
  server.report('Invalid edit');
  assert.equal((await post('', { revision: 1, first: 0, last: 10 })).status, 400);
  server.update(project);
  results.revisions =
    'Active and queued work cancelled; stale resume/create and invalid-project create rejected';
}
async function checkShutdown() {
  const job = await enqueue(2);
  await waitForJob(job.id, (job) => (job.progress?.renderedFrames ?? 0) >= 35);
  await server.close();
  closed = true;
  await assert.rejects(fetch(`${origin}/exports`));
  const files = await readdir(join(outputs, job.id));
  assert(!files.some((name) => name.endsWith('.mp4')), 'Shutdown published partial output');
  const checkpoint = `${join(outputs, job.filename)}.setcast-resume`;
  assert(
    !(await readdir(checkpoint)).includes('lock.json'),
    'Shutdown left the checkpoint writer locked',
  );
  assert(
    !files.some((name) => name.startsWith('.setcast-')),
    'Shutdown left temporary export files',
  );
  results.shutdown = 'Server closed, writer unlocked, checkpoint retained, no partial output';
}
function decoded(file: string, map: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', map, '-f', 'framemd5', '-'],
    { encoding: 'utf8' },
  );
}

function foreignHostStatus() {
  return new Promise<number>((resolve, reject) => {
    const request = get(
      `${origin}/exports`,
      { headers: { Host: 'unrelated.example' } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    request.on('error', reject);
  });
}
