import { randomUUID } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { SessionHeaderSchema, SessionEventSchema, readSession } from '@setcast/core';

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

async function appendEvent(file: string, event: unknown) {
  const handle = await open(file, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 16 * 1024 * 1024)
      throw new Error('Journal must be a regular file under 16 MiB. Start another journal.');
    const text = await handle.readFile('utf8');
    const line = JSON.stringify(event) + '\n';
    readSession(text + line);
    await handle.appendFile(line);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
