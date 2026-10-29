import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { exportEncoding, videoArgs } from '../src/export/encoding.ts';
import { hardwareEncoder, probeHardware } from '../src/export/hardware.ts';
import { captureBrowserArgs } from '../src/export/graphics.ts';

const { values } = parseArgs({
  options: { out: { type: 'string' }, hardware: { type: 'boolean' } },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for color-contract observations.');
const encoder = values.hardware ? hardwareEncoder(process.platform) : 'libx264';
if (!encoder) throw new Error('No hardware encoder configured for this platform.');
if (values.hardware) await probeHardware(encoder);
const root = resolve(values.out);
await mkdir(root);
const width = 640,
  height = 360;
const colors = [
  '#000000',
  '#010101',
  '#040404',
  '#080808',
  '#101010',
  '#202020',
  '#404040',
  '#808080',
  '#ffffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#00ffff',
  '#ff00ff',
  '#ffff00',
  '#808040',
];
const patches = colors.map((color, index) => ({
  color,
  x: (index % 8) * 80 + 40,
  y: Math.floor(index / 8) * 80 + 40,
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="dark"><stop stop-color="#000"/><stop offset="1" stop-color="#202020"/></linearGradient><linearGradient id="full"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="640" height="360" fill="#0b0f14"/>${colors.map((color, index) => `<rect x="${(index % 8) * 80}" y="${Math.floor(index / 8) * 80}" width="80" height="80" fill="${color}"/>`).join('')}<rect y="160" width="640" height="50" fill="url(#dark)"/><rect y="210" width="640" height="50" fill="url(#full)"/><text x="20" y="290" fill="#eee" font-family="sans-serif" font-size="16">Żółć 0123456789 AaBb – fine type</text><text x="20" y="324" fill="#ffb547" font-family="sans-serif" font-size="22">Saturated highlights · small credits</text><path d="M20 345H620" stroke="#18d7ff"/></svg>`;
await writeFile(join(root, 'chart.svg'), svg);
const browser = await chromium.launch({ args: captureBrowserArgs() });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const report: Record<string, unknown> = {
  version: 1,
  jpegQuality: 90,
  encoder,
  chromium: browser.version(),
  ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0],
  variants: {},
};
try {
  await page.setContent(
    `<style>body{margin:0}img,video{display:block;width:640px;height:360px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`,
  );
  await page.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  const png = await page.screenshot({ type: 'png' });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 90 });
  await writeFile(join(root, 'reference.png'), png);
  await writeFile(join(root, 'capture.jpg'), jpeg);
  const reference = pixels(png);
  const variants: Record<string, string[] | null> = {
    production: null,
    'legacy-untagged': [],
    '601-full-srgb-params': [
      '-vf',
      'setparams=range=full:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt470bg',
    ],
    '601-limited-srgb': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt601:out_range=tv',
      '-colorspace',
      'bt470bg',
      '-color_range',
      'tv',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'iec61966-2-1',
    ],
    '709-limited-srgb': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'iec61966-2-1',
    ],
    '709-limited-tag': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
    ],
    '709-srgb-params': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709',
    ],
    '601-srgb-params': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt601:out_range=tv,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt470bg',
    ],
    '709-srgb-accurate': [
      '-vf',
      'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bitexact,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709',
    ],
    '709-limited-convert': [
      '-vf',
      'colorspace=ispace=bt470bg:irange=pc:iprimaries=bt709:itrc=srgb:space=bt709:range=tv:primaries=bt709:trc=bt709:format=yuv420p',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
    ],
  };
  for (const [name, policy] of Object.entries(variants)) {
    const file = join(root, `${name}.mp4`);
    const encoding = exportEncoding({
      projectDir: root,
      out: file,
      ...(values.hardware ? { hardwareAcceleration: 'required', videoBitrate: '8M' } : {}),
    });
    const args = videoArgs(30, encoding, file, encoder);
    applyPolicy(args, policy);
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], {
      input: Buffer.concat(Array.from({ length: 30 }, () => jpeg)),
      timeout: 30_000,
    });
    const stream = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', file],
        { encoding: 'utf8' },
      ),
    ).streams[0];
    const decoded = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    await page.route('http://color-probe.local/video.mp4', (route) =>
      route.fulfill({ path: file, contentType: 'video/mp4' }),
    );
    await page.setContent(
      '<style>body{margin:0}video{display:block;width:640px;height:360px}</style><video muted></video>',
    );
    await page.locator('video').evaluate(async (video: HTMLVideoElement) => {
      video.src = 'http://color-probe.local/video.mp4';
      const painted = new Promise<void>((done) => video.requestVideoFrameCallback(() => done()));
      await video.play();
      await painted;
      video.pause();
    });
    const displayed = await page.screenshot({ path: join(root, `${name}-playback.png`) });
    const playback = difference(reference, pixels(displayed));
    if (name === 'production') assertProduction(stream, playback);
    const decodedHash = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-map', '0:v', '-pix_fmt', 'rgb24', '-f', 'hash', '-'],
      { encoding: 'utf8', timeout: 30_000 },
    ).trim();
    (report.variants as Record<string, unknown>)[name] = {
      args,
      decodedHash,
      metadata: Object.fromEntries(
        [
          'pix_fmt',
          'color_range',
          'color_space',
          'color_transfer',
          'color_primaries',
          'chroma_location',
        ].map((key) => [key, stream[key] ?? null]),
      ),
      decodedRgb: difference(reference, decoded),
      browserPlayback: playback,
    };
    await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
    await page.unroute('http://color-probe.local/video.mp4');
    process.stdout.write(`${name}: recorded metadata and decoded/playback pixel differences\n`);
  }
  if (encoder === 'libx264') {
    const variants = report.variants as Record<string, { decodedHash: string }>;
    assert.equal(
      variants.production!.decodedHash,
      variants['legacy-untagged']!.decodedHash,
      'Color metadata changed software-decoded RGB values',
    );
  }
} finally {
  await browser.close();
}
function pixels(png: Buffer) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
    { input: png, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );
}
function difference(reference: Buffer, actual: Buffer) {
  assert.equal(actual.length, width * height * 3);
  let total = 0,
    squares = 0,
    maximum = 0;
  for (let index = 0; index < reference.length; index++) {
    const distance = Math.abs(actual[index]! - reference[index]!);
    total += distance;
    squares += distance * distance;
    maximum = Math.max(maximum, distance);
  }
  return {
    mean: total / reference.length,
    rms: Math.sqrt(squares / reference.length),
    maximum,
    patches: patches.map(({ color, x, y }) => ({
      color,
      expected: [...reference.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)],
      actual: [...actual.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)],
    })),
  };
}

function applyPolicy(args: string[], policy: string[] | null) {
  if (policy === null) return;
  const productionFilter = args.indexOf('-vf');
  if (productionFilter !== -1) args.splice(productionFilter, 2);
  args.splice(args.length - 1, 0, ...policy);
}
function assertProduction(
  stream: Record<string, unknown>,
  playback: ReturnType<typeof difference>,
) {
  assert.equal(stream.color_range, 'pc');
  assert.equal(stream.color_space, 'bt470bg');
  assert.equal(stream.color_transfer, 'iec61966-2-1');
  assert.equal(stream.color_primaries, 'bt709');
  for (const patch of playback.patches)
    for (let channel = 0; channel < 3; channel++)
      assert(
        Math.abs(patch.expected[channel]! - patch.actual[channel]!) <= 3,
        `Production playback changed ${patch.color} beyond 3 channel levels`,
      );
}
