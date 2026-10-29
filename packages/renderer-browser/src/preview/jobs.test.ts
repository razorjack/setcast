import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import {
  normalizeMix,
  type RenderOptions,
  type RenderResult,
  type ResolvedProject,
} from '@setcast/core';
import { PreviewJobs } from './jobs.ts';
import type { PreviewRevision } from './server.ts';

const project: ResolvedProject = {
  title: 'Queue',
  audio: 'audio.wav',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 640,
  height: 360,
  fps: 30,
  mix: normalizeMix({}, 3.1415),
  presentation: 'playlist',
  modulation: [],
  visualizers: [],
  envelope: null,
  travel: null,
  panel: null,
  tracklist: null,
  bpm: null,
  beatOffset: 0,
  branding: null,
  announcements: [],
  clockOffset: 0,
  clockTotal: null,
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'setcast-preview-jobs-'));
  const state: PreviewRevision = { revision: 0, project: structuredClone(project), error: null };
  const calls: { project: ResolvedProject; options: RenderOptions; finish: () => void }[] = [];
  const sessions: string[] = [];
  const exporter = {
    async withRenderSession<T>(task: () => Promise<T>) {
      sessions.push('open');
      try {
        return await task();
      } finally {
        sessions.push('close');
      }
    },
    render(project: ResolvedProject, options: RenderOptions) {
      const waiting = Promise.withResolvers<RenderResult>();
      options.signal!.addEventListener('abort', () => waiting.reject(options.signal!.reason), {
        once: true,
      });
      calls.push({
        project,
        options,
        finish: () => waiting.resolve({ file: options.out, frames: 1, durationSeconds: 1 / 30 }),
      });
      return waiting.promise;
    },
  };
  const queue = new PreviewJobs(
    state,
    { directory, projectDir: directory, settings: { chunkSeconds: 1 } },
    exporter,
  );
  cleanups.push(async () => {
    await queue.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { queue, state, calls, sessions, directory };
}
const request = { revision: 0, first: 32, last: 94 };

test('serial jobs freeze inputs, preserve the partial final frame and share a render session', async () => {
  const { queue, calls, sessions, state } = await fixture();
  const first = queue.enqueue(request);
  queue.enqueue({ ...request, first: 60 });
  state.project.title = 'Modified caller object';
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.project.title).toBe('Queue');
  expect(calls[0]!.options.range).toEqual([32 / 30, 95 / 30]);
  expect(calls[0]!.options.resume).toBe(true);
  expect(calls[0]!.options.chunkSeconds).toBe(1);
  expect(queue.list().map((job) => job.status)).toEqual(['running', 'queued']);
  calls[0]!.finish();
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(queue.completedFile(first.id)).toBe(calls[0]!.options.out);
  calls[1]!.finish();
  await vi.waitFor(() => expect(sessions).toEqual(['open', 'close']));
  expect(queue.list().map((job) => job.status)).toEqual(['complete', 'complete']);
  expect(calls[0]!.options.out).not.toBe(calls[1]!.options.out);
});

test('cancellation settles before resume and reuses the same destination', async () => {
  const { queue, calls } = await fixture();
  const job = queue.enqueue(request);
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  queue.cancel(job.id);
  expect(() => queue.resume(job.id)).toThrow('Only cancelled or failed');
  await vi.waitFor(() => expect(queue.list()[0]!.status).toBe('cancelled'));
  queue.resume(job.id);
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]!.options.out).toBe(calls[0]!.options.out);
  expect(calls[1]!.options.signal!.aborted).toBe(false);
  calls[1]!.finish();
  await vi.waitFor(() => expect(queue.list()[0]!.status).toBe('complete'));
  expect(() => queue.resume(job.id)).toThrow('Only cancelled or failed');
});

test('revision invalidation stops queued jobs and shutdown waits for active cleanup', async () => {
  const { queue, calls, state, sessions } = await fixture();
  const first = queue.enqueue(request);
  queue.enqueue(request);
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  queue.invalidate('Project changed');
  state.revision++;
  await queue.close();
  expect(calls).toHaveLength(1);
  expect(sessions).toEqual(['open', 'close']);
  expect(queue.list().map((job) => job.status)).toEqual(['cancelled', 'cancelled']);
  expect(() => queue.resume(first.id)).toThrow('Preview is stopping');
});

test('rejects unsafe payloads, stale revisions, invalid ranges and queue overflow before export', async () => {
  const { queue, calls, state } = await fixture();
  for (const body of [
    null,
    [],
    {},
    { ...request, out: '../existing.mp4' },
    { ...request, revision: 3 },
    { ...request, first: -1 },
    { ...request, last: 95 },
    { ...request, first: 32.5 },
    { ...request, first: 93, last: 32 },
  ])
    expect(() => queue.enqueue(body)).toThrow();
  expect(calls).toHaveLength(0);
  state.error = 'Bad YAML';
  expect(() => queue.enqueue(request)).toThrow('invalid edits');
  state.error = null;
  const first = queue.enqueue(request);
  for (let index = 0; index < 4; index++) queue.enqueue(request);
  expect(() => queue.enqueue(request)).toThrow('Four exports are waiting');
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  queue.cancel(first.id);
  state.revision++;
  queue.invalidate('Project changed');
  await vi.waitFor(() => expect(queue.list()[0]!.status).toBe('cancelled'));
  expect(() => queue.resume(first.id)).toThrow('project changed');
});
