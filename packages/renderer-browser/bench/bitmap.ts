import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { bitmapBytes } from '../src/export/bitmap.ts';

declare global {
  interface Window {
    encodeBitmap: (pixels: Parameters<typeof bitmapBytes>[0]) => string;
  }
}
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY.');
const out = resolve(values.out);
await mkdir(out);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({
    content: `const bitmapBytes = ${bitmapBytes.toString()}; window.encodeBitmap = pixels => URL.createObjectURL(new Blob([bitmapBytes(pixels)], {type: "image/bmp"}));`,
  });
  const results = await page.evaluate(async () => {
    const results = [];
    for (const alpha of ['opaque', 'gradient', 'transparent'] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = 17;
      canvas.height = 13;
      const context = canvas.getContext('2d')!;
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let pixel = 0; pixel < pixels.data.length / 4; pixel++) {
        pixels.data[pixel * 4] = (pixel * 23) % 256;
        pixels.data[pixel * 4 + 1] = (pixel * 67) % 256;
        pixels.data[pixel * 4 + 2] = (pixel * 137) % 256;
        pixels.data[pixel * 4 + 3] = { opaque: 255, transparent: 0, gradient: pixel % 256 }[alpha];
      }
      context.putImageData(pixels, 0, 0);
      const urls = [
        canvas.toDataURL('image/png'),
        window.encodeBitmap(context.getImageData(0, 0, canvas.width, canvas.height)),
      ];
      const images = await Promise.all(
        urls.map(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        }),
      );
      for (const background of ['transparent', '#111111', '#ffffff']) {
        const decoded = images.map((image) => {
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (background !== 'transparent') {
            context.fillStyle = background;
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        });
        let mismatched = 0,
          maxDelta = 0;
        for (let index = 0; index < decoded[0]!.length; index++) {
          const delta = Math.abs(decoded[0]![index]! - decoded[1]![index]!);
          mismatched += Number(delta !== 0);
          maxDelta = Math.max(maxDelta, delta);
        }
        results.push({ alpha, background, mismatched, maxDelta });
      }
    }
    return results;
  });
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify({ chromium: browser.version(), results }, null, 2) + '\n',
  );
  assert(
    results.every((result) => result.mismatched === 0),
    JSON.stringify(results),
  );
  process.stdout.write('Bitmap roundtrip: exact RGBA including alpha and background compositing\n');
} finally {
  await browser.close();
}
