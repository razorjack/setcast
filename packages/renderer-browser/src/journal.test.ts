import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { readSession } from '@setcast/core';
import { appendJournal, startJournal } from './journal.ts';

const header = {
  type: 'session',
  version: 1,
  sampleRate: 48000,
  originSample: 0,
  captureId: 'test',
  startedAt: '2026-10-22T10:00:00Z',
};

test('journal serializes concurrent writes and rejects writes after the end without damaging saved lines', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-journal-'));
  try {
    const { journal } = await startJournal(root, header);
    await Promise.all(
      [1, 2, 3].map((sample) =>
        appendJournal(root, { journal, event: { type: 'cue', sample, kind: 'drop' } }),
      ),
    );
    await appendJournal(root, { journal, event: { type: 'end', sample: 4 } });
    const before = await readFile(join(root, journal), 'utf8');
    await expect(
      appendJournal(root, { journal, event: { type: 'cue', sample: 5, kind: 'drop' } }),
    ).rejects.toThrow('follow an end');
    expect(await readFile(join(root, journal), 'utf8')).toBe(before);
    expect(readSession(before).events.map((event) => event.sample)).toEqual([1, 2, 3, 4]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a journal symlink cannot append to another file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-journal-'));
  try {
    const file = join(root, 'original');
    await writeFile(file, JSON.stringify(header) + '\n');
    const journal = 'session-00000000-0000-0000-0000-000000000000.jsonl';
    await symlink(file, join(root, journal));
    await expect(
      appendJournal(root, { journal, event: { type: 'end', sample: 0 } }),
    ).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe(JSON.stringify(header) + '\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
