import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vite-plus/test';
import { readWav } from './audio.ts';

type Variant = { format: number; bits: number; extensible?: boolean };

const RATE = 8000;
const FRAMES = 100;
const CHANNELS = 2;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/** The sample the reader is checked against: a 1 kHz sine at half scale. */
const sineAt = (frame: number) => Math.sin((2 * Math.PI * 1000 * frame) / RATE) * 0.5;

/** A 1 kHz sine, stereo, 100 frames at 8 kHz, in the given sample format. */
const wav = (variant: Variant): Buffer =>
  chunk(
    'RIFF',
    Buffer.concat([
      Buffer.from('WAVE', 'latin1'),
      chunk('fmt ', formatChunk(variant)),
      chunk('data', dataChunk(variant)),
    ]),
  );

function formatChunk({ format, bits, extensible }: Variant): Buffer {
  const bytes = bits / 8;
  const fmt = Buffer.alloc(extensible ? 40 : 16);
  fmt.writeUInt16LE(extensible ? EXTENSIBLE : format, 0);
  fmt.writeUInt16LE(CHANNELS, 2);
  fmt.writeUInt32LE(RATE, 4);
  fmt.writeUInt32LE(RATE * bytes * CHANNELS, 8);
  fmt.writeUInt16LE(bytes * CHANNELS, 12);
  fmt.writeUInt16LE(bits, 14);
  if (!extensible) return fmt;

  // The extension: size, valid bits, channel mask, then the real format as the head of a GUID.
  fmt.writeUInt16LE(22, 16);
  fmt.writeUInt16LE(bits, 18);
  fmt.writeUInt32LE(3, 20);
  fmt.writeUInt16LE(format, 24);
  return fmt;
}

function dataChunk(variant: Variant): Buffer {
  const bytes = variant.bits / 8;
  const write = sampleWriter(variant);
  const data = Buffer.alloc(FRAMES * CHANNELS * bytes);

  for (let frame = 0; frame < FRAMES; frame++) {
    const sample = sineAt(frame);
    for (let channel = 0; channel < CHANNELS; channel++) {
      write(data, (frame * CHANNELS + channel) * bytes, sample);
    }
  }
  return data;
}

type SampleWriter = (data: Buffer, at: number, sample: number) => void;

/** The mirror image of the reader's own format table, so a round trip exercises both. */
function sampleWriter({ format, bits }: Variant): SampleWriter {
  if (format === FLOAT) return (data, at, sample) => data.writeFloatLE(sample, at);
  if (bits === 16) return (data, at, sample) => data.writeInt16LE(round(sample, 0x7fff), at);
  if (bits === 24) return (data, at, sample) => data.writeIntLE(round(sample, 0x7fffff), at, 3);
  return (data, at, sample) => data.writeInt32LE(round(sample, 0x7fffffff), at);
}

const round = (sample: number, fullScale: number) => Math.round(sample * fullScale);

function chunk(id: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'latin1');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'setcast-wav-'));
});

const variants: [string, Variant][] = [
  ['pcm16', { format: 1, bits: 16 }],
  ['pcm24', { format: 1, bits: 24 }],
  ['pcm32', { format: 1, bits: 32 }],
  ['float32', { format: 3, bits: 32 }],
  ['extensible24', { format: 1, bits: 24, extensible: true }],
];

test.each(variants)('reads %s WAV', async (name, variant) => {
  const file = join(dir, `${name}.wav`);
  await writeFile(file, wav(variant));

  const samples = await readWav(file, RATE);

  expect(samples?.length).toBe(FRAMES);
  expect(samples?.[1]).toBeCloseTo(sineAt(1), 3);
});
