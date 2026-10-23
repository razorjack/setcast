import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const { values } = parseArgs({
  options: { reference: { type: 'string' }, out: { type: 'string' } },
});
if (!values.reference || !values.out)
  throw new Error(
    'Usage: node packages/renderer-browser/bench/spectrum.ts --reference REF --out NEW_JSON',
  );
const revision = execFileSync(
  'git',
  ['rev-parse', '--verify', '--end-of-options', `${values.reference}^{commit}`],
  { encoding: 'utf8' },
).trim();
const path = 'packages/core/src/spectrum.ts';
const reference = execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' });
const current = await readFile(new URL('../../core/src/spectrum.ts', import.meta.url), 'utf8');
const source = { reference: moduleUrl(reference), current: moduleUrl(current) };
const node = await compare(source);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const browserResult = await page.evaluate(compare, source);
  await writeFile(
    values.out,
    JSON.stringify(
      {
        version: 1,
        reference: revision,
        currentSourceSha256: createHash('sha256').update(current).digest('hex'),
        node: process.version,
        chromium: browser.version(),
        cpu: cpus()[0]?.model,
        equalWindows: 256,
        warmupTransformsPerImplementation: 4000,
        transformsPerMeasurement: 4000,
        nodeMeasurements: node,
        browserMeasurements: browserResult,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  process.stdout.write(
    `Spectrum: exact agreement in Node and Chromium; timings in ${values.out}\n`,
  );
} finally {
  await browser.close();
}

function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
}

/** Self-contained so the same experiment runs in Node and the pinned browser. */
async function compare(source: { reference: string; current: string }) {
  type Spectrum = (pcm: Float32Array, center: number) => number[];
  const reference = (await import(source.reference)) as { spectrum: Spectrum };
  const current = (await import(source.current)) as { spectrum: Spectrum };
  const pcm = Float32Array.from(
    { length: 8192 },
    (_, index) =>
      Math.sin(index * 0.12) * 0.3 +
      Math.cos(index * 0.019) * 0.2 +
      (((Math.imul(index, 1664525) >>> 0) % 997) / 997) * 0.1,
  );
  for (let index = 0; index < 256; index++) {
    const center = index * 43 - 500;
    const expected = reference.spectrum(pcm, center);
    const actual = current.spectrum(pcm, center);
    if (
      actual.length !== expected.length ||
      actual.some((value, bin) => !Object.is(value, expected[bin]))
    )
      throw new Error(`Spectrum differs at window ${index}, center ${center}.`);
  }
  for (let index = 0; index < 4000; index++) {
    reference.spectrum(pcm, 4096);
    current.spectrum(pcm, 4096);
  }
  const measurements = [];
  for (let repeat = 0; repeat < 6; repeat++) {
    const order = repeat % 2 ? ['current', 'reference'] : ['reference', 'current'];
    for (const name of order) {
      const implementation = name === 'reference' ? reference : current;
      const started = performance.now();
      let checksum = 0;
      for (let index = 0; index < 4000; index++)
        checksum += implementation.spectrum(pcm, 2048 + (index % 4096))[12]!;
      measurements.push({
        repeat,
        implementation: name,
        milliseconds: performance.now() - started,
        checksum,
      });
    }
  }
  return measurements;
}
