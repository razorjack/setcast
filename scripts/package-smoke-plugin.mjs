import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { loadProject, loadLiveProject, probeAudio, saveScene } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { render, still, withRenderSession } from '@setcast/renderer-browser/export';
import { play } from '@setcast/renderer-browser';
import { preview } from '@setcast/renderer-browser/preview';

const [source, cli, compatibility] = process.argv.slice(2);
const browserRequire = createRequire(import.meta.resolve('@setcast/renderer-browser/package.json'));
const { chromium } = browserRequire('playwright');
const original = await loadProject(source, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const projectDir = join(dirname(source), 'plugin-project');
await mkdir(projectDir);
const audio = `master${extname(original.project.audio)}`;
await copyFile(join(source, original.project.audio), join(projectDir, audio));
await writeFile(join(projectDir, 'theme.css'), '.setcast { background: #111; color: white; }');
await writeFile(
  join(projectDir, 'marker.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#00f" d="M0 0h32v32H0z"/></svg>',
);
const appearance =
  'theme: ./theme.css\nplugins: [setcast-viz-fixture]\nvisualizer: { name: fixture-marker, label: Installed, image: marker.svg }\n';
const config = `${appearance}audio: ${audio}\nplays: [{at: 0, title: Plugin test}]\npanel: false\noutput: { width: 320, height: 180, fps: 30, chunkSeconds: 1 }\n`;
await writeFile(join(projectDir, 'setcast.yaml'), config);
await writeFile(
  join(projectDir, 'live.yaml'),
  `${appearance}output: { width: 320, height: 180, fps: 30 }\n`,
);
const command = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
assert.equal(JSON.parse(command('validate', projectDir, '--json')).valid, true);
assert.equal(JSON.parse(command('validate', projectDir, '--live', '--json')).valid, true);
assert(command('schema', 'visualizer', '--project', projectDir).includes('fixture-marker'));
const load = () =>
  loadProject(projectDir, { themes, probeDuration: (audio, root) => probeAudio({ audio }, root) });
const { project } = await load();
const settings = { projectDir, range: [0, 0.2], concurrency: 1 };
const cached = join(projectDir, 'cache');
const output = join(projectDir, 'browser.mp4');
await render(project, { ...settings, out: output, cache: { directory: cached } });
assertMarker(output);
let repeatedFrames = 0;
const repeated = join(projectDir, 'repeated.mp4');
await render(project, {
  ...settings,
  out: repeated,
  cache: { directory: cached },
  onProgress: (event) => {
    if (event.stage === 'frames')
      repeatedFrames += (event.renderedFrames ?? 0) - (event.reusedFrames ?? 0);
  },
});
assert.equal(repeatedFrames, 0, 'Unchanged plugin export did not reuse capture');
assert.equal(decodedHash(output), decodedHash(repeated));
await render(project, { ...settings, out: join(projectDir, 'resumed.mp4'), resume: true });
assertMarker(join(projectDir, 'resumed.mp4'));
const parallel = join(projectDir, 'parallel.mp4');
await render(project, { ...settings, concurrency: 2, out: parallel });
assert.equal(decodedHash(output), decodedHash(parallel));
const portrait = join(projectDir, 'portrait.png');
await still({ ...project, width: 180, height: 320 }, { projectDir, at: 0, out: portrait });
assertMarker(portrait, 180);
await withRenderSession(async () => {
  await still(
    { ...project, plugins: undefined, visualizers: [] },
    { projectDir, at: 0, out: join(projectDir, 'plain.png') },
  );
  await still(project, { projectDir, at: 0, out: join(projectDir, 'plugin.png') });
});
assertMarker(join(projectDir, 'plugin.png'));

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
  await checkPreview(browser, project);
  const live = await loadLiveProject(projectDir, { themes });
  await checkPlayer(browser, live.project);
  await checkPlayer(browser, project);
  const saved = await saveScene(projectDir, live.project, {
    theme: live.project.theme,
    art: 'project',
  });
  const restored = await loadLiveProject(join(projectDir, saved.directory));
  assert.equal(restored.project.plugins[0].package, 'setcast-viz-fixture');
  assert(
    (await readFile(join(projectDir, saved.directory, restored.project.visualizers[0].image)))
      .length > 0,
  );
  await writeFile(
    join(projectDir, 'setcast.yaml'),
    `${config}scenes: [{at: 0, preset: ${saved.directory}}]\n`,
  );
  const sceneExport = (await load()).project;
  await render(sceneExport, {
    ...settings,
    out: join(projectDir, 'scene.mp4'),
    cache: { directory: cached },
  });
  assertMarker(join(projectDir, 'scene.mp4'));
} finally {
  await browser.close();
}
if (compatibility === 'true') {
  const remotion = await import('@setcast/renderer-remotion');
  const out = join(projectDir, 'remotion.mp4');
  await remotion.render(project, { ...settings, out, gl: 'swangle' });
  assertMarker(out);
  console.log('  installed plugin: optional Remotion export pixels pass');
}
console.log(
  '  installed plugin: schema, validation, browser export, cache/resume, mixed session bundles, preview, recorded/live player, saved scenes pass',
);

function assertMarker(file, width = 320) {
  const pixels = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  const green = (25 * width + 25) * 3;
  const blue = (25 * width + 75) * 3;
  assert(
    pixels[green] < 30 && pixels[green + 1] > 220 && pixels[green + 2] < 30,
    `Plugin marker absent: ${file}`,
  );
  assert(
    pixels[blue] < 30 && pixels[blue + 1] < 30 && pixels[blue + 2] > 220,
    `Plugin asset absent: ${file}`,
  );
}

function decodedHash(file) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'hash', '-hash', 'sha256', '-'],
    { encoding: 'utf8' },
  );
}

async function checkPreview(browser, project) {
  const server = await preview(project, { projectDir, port: 0 });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(new URL('frame.html', server.url).href);
    await page.waitForFunction(() => Boolean(window.setcastExport));
    await page.evaluate(() => window.setcastExport.frame(5));
    assert.equal(await page.locator('[data-plugin-fixture]').getAttribute('data-frame'), '5');
    await page.evaluate(() => window.setcastExport.frame(0));
    assert.equal(await page.locator('[data-plugin-fixture]').getAttribute('data-frame'), '0');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await server.close();
  }
}

async function checkPlayer(browser, project) {
  const server = await play(project, { projectDir, port: 0 });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(server.url);
    await page.locator('[data-plugin-fixture="Installed"]').waitFor();
    if (!project.mix) {
      await page.getByRole('button', { name: 'Start input', exact: true }).click();
      await page.locator('main[data-capture=running][data-input-available=true]').waitFor();
      await page.waitForFunction(
        () =>
          Number(document.querySelector('[data-plugin-fixture]')?.getAttribute('data-frame')) > 5,
      );
      await page.getByRole('button', { name: 'Stop input', exact: true }).click();
    }
    assert.equal(
      await page
        .locator('[data-plugin-fixture] img')
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await server.close();
  }
}
