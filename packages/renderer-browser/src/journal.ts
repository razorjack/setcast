import { randomUUID } from 'node:crypto';
import { open, writeFile, type FileHandle } from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import { join } from 'node:path';
import {
  SessionHeaderSchema,
  SessionEventSchema,
  readSession,
  type SessionEvent,
} from '@setcast/core';

interface JournalTail {
  size: number;
  modified: number;
  changed: number;
  inode: number;
  sample: number;
  ended: boolean;
}
const tails = new Map<string, JournalTail>();
const MAX_BYTES = 64 * 1024 * 1024;
const writers = new Map<string, Promise<unknown>>();

export async function startJournal(root: string, header: unknown) {
  const validated = SessionHeaderSchema.parse(header);
  const journal = `session-${randomUUID()}.jsonl`;
  await writeFile(join(root, journal), JSON.stringify(validated) + '\n', {
    flag: 'wx',
    flush: true,
  });
  return { journal };
}

export async function appendJournal(root: string, request: { journal?: unknown; event?: unknown }) {
  if (
    typeof request.journal !== 'string' ||
    !/^session-[a-f0-9-]{36}\.jsonl$/.test(request.journal)
  ) {
    throw new Error('Invalid session journal path. Start a journal from this player first.');
  }
  const event = SessionEventSchema.parse(request.event);
  const file = join(root, request.journal);
  const previous = writers.get(file) ?? Promise.resolve();
  const writing = previous.then(() => appendEvent(file, event));
  writers.set(file, writing);
  try {
    await writing;
  } finally {
    if (writers.get(file) === writing) writers.delete(file);
  }
  return { journal: request.journal };
}

async function appendEvent(file: string, event: SessionEvent) {
  const handle = await open(file, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    const line = JSON.stringify(event) + '\n';
    if (!info.isFile() || info.size + Buffer.byteLength(line) > MAX_BYTES)
      throw new Error('Journal must be a regular file under 64 MiB. Start another journal.');
    const tail = await journalTail(file, handle, info);
    if (tail.ended || event.sample < tail.sample)
      throw new Error(
        'Journal events are out of order or follow an end event. Use one ordered capture session per journal.',
      );
    await handle.appendFile(line);
    await handle.sync();
    rememberTail(file, await handle.stat(), event);
  } catch (error) {
    tails.delete(file);
    throw error;
  } finally {
    await handle.close();
  }
}

async function journalTail(file: string, handle: FileHandle, info: Stats) {
  const cached = tails.get(file);
  if (
    cached &&
    cached.size === info.size &&
    cached.modified === info.mtimeMs &&
    cached.changed === info.ctimeMs &&
    cached.inode === info.ino
  )
    return cached;
  const text = await handle.readFile('utf8');
  if (!text.endsWith('\n'))
    throw new Error(
      'Journal ends with an incomplete line. Restore the final newline or start another journal.',
    );
  const { events } = readSession(text);
  return { sample: events.at(-1)?.sample ?? 0, ended: events.at(-1)?.type === 'end' };
}

function rememberTail(file: string, info: Stats, event: SessionEvent) {
  tails.delete(file);
  if (event.type === 'end') return;
  tails.set(file, {
    size: info.size,
    modified: info.mtimeMs,
    changed: info.ctimeMs,
    inode: info.ino,
    sample: event.sample,
    ended: false,
  });
  if (tails.size > 32) tails.delete(tails.keys().next().value!);
}
