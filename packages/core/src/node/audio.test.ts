import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vite-plus/test';
import { readWav } from './audio.ts';

type Variant = { format: number; bits: number; extensible?: boolean };

/** A 1 kHz sine, stereo, 100 frames at 8 kHz, in the given sample format. */
function wav({ format, bits, extensible }: Variant): Buffer {
  const rate = 8000;
  const frames = 100;
  const bytes = bits / 8;
  const fmtSize = extensible ? 40 : 16;
  const fmt = Buffer.alloc(fmtSize);
  fmt.writeUInt16LE(extensible ? 0xfffe : format, 0);
  fmt.writeUInt16LE(2, 2);
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * bytes * 2, 8);
  fmt.writeUInt16LE(bytes * 2, 12);
  fmt.writeUInt16LE(bits, 14);
  if (extensible) {
    fmt.writeUInt16LE(22, 16);
    fmt.writeUInt16LE(bits, 18);
    fmt.writeUInt32LE(3, 20);
    fmt.writeUInt16LE(format, 24);
  }
  const data = Buffer.alloc(frames * 2 * bytes);
  for (let i = 0; i < frames; i++) {
    const v = Math.sin((2 * Math.PI * 1000 * i) / rate) * 0.5;
    for (const c of [0, 1]) {
      const at = (i * 2 + c) * bytes;
      if (format === 3) data.writeFloatLE(v, at);
      else if (bits === 16) data.writeInt16LE(Math.round(v * 0x7fff), at);
      else if (bits === 24) data.writeIntLE(Math.round(v * 0x7fffff), at, 3);
      else data.writeInt32LE(Math.round(v * 0x7fffffff), at);
    }
  }
  const chunk = (id: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const body = Buffer.concat([
    Buffer.from('WAVE', 'latin1'),
    chunk('fmt ', fmt),
    chunk('data', data),
  ]);
  return chunk('RIFF', body);
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
  const samples = await readWav(file, 8000);
  expect(samples?.length).toBe(100);
  expect(samples?.[1]).toBeCloseTo(Math.sin((2 * Math.PI * 1000) / 8000) * 0.5, 3);
});
