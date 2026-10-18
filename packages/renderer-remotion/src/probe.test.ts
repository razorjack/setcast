import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';
import { probeAudio } from './probe.ts';

const project = { audio: 'assets/mix.wav' } as ResolvedProject;

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
