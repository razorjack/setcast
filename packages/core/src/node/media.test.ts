import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';
import { audioDuration, probeAudio } from './media.ts';

const project = { audio: 'assets/mix.wav' } as ResolvedProject;

test('retains MP3 container duration, including encoder padding', async () => {
  // FFmpeg/libmp3lame, 1.2345 s of a 1 kHz sine, 48 kHz stereo, quality 5.
  const file = fileURLToPath(new URL('./fixtures/probe-tone.mp3', import.meta.url));
  expect(await audioDuration(file)).toBe(1.272);
});

test('keeps fractional WAV duration without rounding to frames or whole seconds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-probe-'));
  try {
    const samples = 59257;
    const bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF');
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(48000, 24);
    bytes.writeUInt32LE(96000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(samples * 2, 40);
    await writeFile(join(dir, 'mix.wav'), bytes);
    expect(await probeAudio({ audio: 'mix.wav' }, dir)).toBe(samples / 48000);
    await expect(probeAudio({ audio: 'missing.wav' }, dir)).rejects.toMatchObject({
      message: 'Cannot read missing.wav as audio',
      cause: expect.any(Error),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('probeAudio translates unreadable media errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-probe-'));
  try {
    await writeFile(join(dir, 'mix.wav'), 'RIFF');

    await expect(probeAudio({ ...project, audio: 'mix.wav' }, dir)).rejects.toMatchObject({
      message: 'Cannot read mix.wav as audio',
      hint: expect.stringContaining('Check the file plays'),
      cause: expect.any(Error),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
