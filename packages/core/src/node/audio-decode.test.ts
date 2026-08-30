import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vite-plus/test';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));

const { decodeMono } = await import('./audio.ts');

test('names an unsupported WAV format when ffmpeg is unavailable', async () => {
  childProcess.spawn.mockImplementation(() => {
    const process = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    process.stdout = new EventEmitter();
    process.stderr = new EventEmitter();
    queueMicrotask(() =>
      process.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' })),
    );
    return process;
  });

  const dir = await mkdtemp(join(tmpdir(), 'setcast-decode-'));
  const file = join(dir, 'mix.wav');
  await writeFile(file, pcm8Wav());

  await expect(decodeMono(file)).rejects.toMatchObject({
    message: 'mix.wav is 8-bit PCM',
    hint: expect.stringContaining('Without ffmpeg only 16/24/32-bit PCM or 32-bit float WAV works'),
  });
});

function pcm8Wav(): Buffer {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(8000, 4);
  format.writeUInt32LE(8000, 8);
  format.writeUInt16LE(1, 12);
  format.writeUInt16LE(8, 14);
  return chunk(
    'RIFF',
    Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', format), chunk('data', Buffer.alloc(8))]),
  );
}

function chunk(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
