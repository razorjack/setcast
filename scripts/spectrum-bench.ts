import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { cpus, platform, arch } from 'node:os';
import { FFT_SIZE, spectrum } from '../packages/core/src/audio/spectrum.ts';

const { values } = parseArgs({ options: { reference: { type: 'string' } } });
const current = { FFT_SIZE, spectrum };
const reference: typeof current = values.reference
  ? await import(pathToFileURL(resolve(values.reference)).href)
  : current;
assert.equal(reference.FFT_SIZE, FFT_SIZE, 'Compare implementations of the same spectrum contract');
const samples = Float32Array.from(
  { length: 8192 },
  (_, index) =>
    Math.sin(index * 0.12) * 0.3 +
    Math.cos(index * 0.019) * 0.2 +
    (((Math.imul(index, 1664525) >>> 0) % 997) / 997) * 0.1,
);
for (let index = 0; index < 256; index++) {
  const center = index * 43 - 500;
  assert.deepEqual(
    current.spectrum(samples, center),
    reference.spectrum(samples, center),
    `Spectrum differs at center ${center}`,
  );
}
const transforms = 4000;
measure(reference.spectrum);
measure(current.spectrum);
const measurements = [];
for (let repeat = 0; repeat < 6; repeat++) {
  const order =
    repeat % 2 ? (['current', 'reference'] as const) : (['reference', 'current'] as const);
  for (const implementation of order) {
    const candidate = implementation === 'current' ? current : reference;
    measurements.push({ repeat, implementation, ...measure(candidate.spectrum) });
  }
}
process.stdout.write(
  JSON.stringify(
    {
      version: 1,
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      reference: values.reference ?? null,
      equalWindows: 256,
      transformsPerMeasurement: transforms,
      warmupTransformsPerImplementation: transforms,
      measurements,
    },
    null,
    2,
  ) + '\n',
);

function measure(transform: typeof spectrum) {
  const start = performance.now();
  let checksum = 0;
  for (let index = 0; index < transforms; index++)
    checksum += transform(samples, 2048 + (index % 4096))[12]!;
  return { milliseconds: performance.now() - start, checksum };
}
