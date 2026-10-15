import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RenderMediaOptions } from '@remotion/renderer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { RenderProgress } from './index.ts';

const mocks = vi.hoisted(() => ({
  renderMedia: vi.fn(),
  muxChunks: vi.fn(),
  encodeMasterAudio: vi.fn(),
  renderChunkPipeline: vi.fn(),
}));
vi.mock('@remotion/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@remotion/renderer')>()),
  renderMedia: mocks.renderMedia,
}));
vi.mock('./mux.ts', () => ({
  muxChunks: mocks.muxChunks,
  encodeMasterAudio: mocks.encodeMasterAudio,
}));
vi.mock('./chunk-pipeline.ts', async (original) => ({
  ...(await original<typeof import('./chunk-pipeline.ts')>()),
  renderChunkPipeline: mocks.renderChunkPipeline,
}));
const { renderVideo, splitFrameRange, resolveChunkSeconds } = await import('./chunks.ts');

test.each([24, 25, 30, 50, 60])('partitions absolute ranges without gaps at %s fps', (fps) => {
  const first = 84 * fps + 1;
  const last = first + 120 * fps;
  expect(splitFrameRange([first, last], 60 * fps)).toEqual([
    [first, first + 60 * fps - 1],
    [first + 60 * fps, last - 1],
    [last, last],
  ]);
  expect(splitFrameRange([first, last], 0)).toEqual([[first, last]]);
  expect(splitFrameRange([first, first], 60 * fps)).toEqual([[first, first]]);
});

test('validates bounded chunk sizes and defaults to one minute', () => {
  expect(resolveChunkSeconds(undefined)).toBe(60);
  expect(resolveChunkSeconds(0)).toBe(0);
  for (const value of [-1, 61, 1.5, NaN, Infinity]) {
    expect(() => resolveChunkSeconds(value)).toThrow('Invalid render chunkSeconds');
  }
});

describe('chunk orchestration', () => {
  let dir: string;
  let job: RenderMediaOptions & { outputLocation: string };
  let progress: RenderProgress[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "setcast-chunks-'test-"));
    progress = [];
    job = {
      codec: 'h264',
      serveUrl: '/bundle',
      outputLocation: join(dir, 'out.mp4'),
      inputProps: { title: 'Test', audio: 'master.wav' },
      composition: {
        id: 'setcast',
        durationInFrames: 9000,
        fps: 30,
        width: 1920,
        height: 1080,
        props: { title: 'Test', audio: 'master.wav' },
        defaultProps: {},
        defaultCodec: null,
        defaultOutName: null,
        defaultVideoImageFormat: null,
        defaultPixelFormat: null,
        defaultProResProfile: null,
        defaultSampleRate: null,
      },
      jpegQuality: 92,
      x264Preset: 'veryfast',
      concurrency: 2,
      disallowParallelEncoding: true,
    };
    mocks.renderMedia.mockReset().mockImplementation(async (options) => {
      const frames = options.frameRange[1] - options.frameRange[0] + 1;
      for (const renderedFrames of [0, frames]) {
        options.onProgress({
          renderedFrames,
          encodedFrames: renderedFrames,
          stitchStage: 'encoding',
        });
      }
      await writeFile(options.outputLocation, 'video');
    });
    mocks.muxChunks.mockReset().mockImplementation(async ({ output, onProgress }) => {
      onProgress(0.5);
      await writeFile(output, 'assembled');
    });
    mocks.encodeMasterAudio.mockReset().mockResolvedValue(undefined);
    mocks.renderChunkPipeline.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const options = () => ({
    frameRange: [2521, 6211] as [number, number],
    chunkSeconds: 60,
    audio: '/project/master.wav',
    report: (event: RenderProgress) => {
      progress.push(event);
    },
  });

  test.each([true, false])(
    'uses the observed parallel decision (%s) before choosing chunk overlap',
    async (parallelEncoding) => {
      job.disallowParallelEncoding = false;
      mocks.renderMedia.mockImplementation(async (chunk) => {
        chunk.onStart({
          parallelEncoding,
          frameCount: chunk.frameRange[1] - chunk.frameRange[0] + 1,
          resolvedConcurrency: 2,
        });
        await writeFile(chunk.outputLocation, 'video');
      });
      await renderVideo(job, options());
      expect(mocks.renderMedia).toHaveBeenCalledTimes(parallelEncoding ? 3 : 1);
      if (parallelEncoding) {
        expect(mocks.renderChunkPipeline).not.toHaveBeenCalled();
      } else {
        expect(
          mocks.renderChunkPipeline.mock.calls[0]![0].map(
            (chunk: { frameRange: number[] }) => chunk.frameRange,
          ),
        ).toEqual([
          [4321, 6120],
          [6121, 6211],
        ]);
      }
      expect(await readFile(job.outputLocation, 'utf8')).toBe('assembled');
    },
  );

  test('renders bounded silent chunks at absolute times and muxes the master once', async () => {
    await renderVideo(job, options());
    const calls = mocks.renderMedia.mock.calls.map(([call]) => call);
    expect(calls.map((call) => call.frameRange)).toEqual([
      [2521, 4320],
      [4321, 6120],
      [6121, 6211],
    ]);
    for (const call of calls) {
      expect(call).toMatchObject({
        muted: true,
        jpegQuality: 92,
        x264Preset: 'veryfast',
        concurrency: 2,
        inputProps: { renderAudio: false, audio: 'master.wav' },
        composition: { durationInFrames: 9000, props: { renderAudio: false, audio: 'master.wav' } },
      });
    }
    expect(job.composition.props).not.toHaveProperty('renderAudio');
    expect(mocks.muxChunks).toHaveBeenCalledOnce();
    expect(mocks.muxChunks).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.stringMatching(/master\.mp4$/), fps: 30 }),
    );
    expect(mocks.encodeMasterAudio).toHaveBeenCalledOnce();
    expect(mocks.encodeMasterAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: '/project/master.wav',
        start: 2521 / 30,
        duration: 3691 / 30,
      }),
    );
    expect(await readFile(job.outputLocation, 'utf8')).toBe('assembled');
    expect(await readdir(dir)).toEqual(['out.mp4']);
    const frames = progress.filter((event) => event.stage === 'frames');
    expect(frames.map((event) => event.renderedFrames)).toEqual([0, 1800, 1800, 3600, 3600, 3691]);
    expect(
      progress.filter((event) => event.stage === 'encode').map((event) => event.progress),
    ).toEqual([0, 0.5, 1]);
  });

  test.each([0, 60])(
    'keeps short exports on the original audio path with chunkSeconds %s',
    async (chunkSeconds) => {
      await renderVideo(job, { ...options(), frameRange: [300, 2099], chunkSeconds });
      expect(mocks.renderMedia).toHaveBeenCalledOnce();
      const call = mocks.renderMedia.mock.calls[0]![0];
      expect(call.muted).toBeUndefined();
      expect(call.inputProps.renderAudio).toBeUndefined();
      expect(mocks.muxChunks).not.toHaveBeenCalled();
      expect(mocks.encodeMasterAudio).not.toHaveBeenCalled();
    },
  );

  test.each(['render', 'mux'])(
    'keeps existing output and removes temporary files after a %s failure',
    async (stage) => {
      await writeFile(job.outputLocation, 'previous export');
      if (stage === 'render') mocks.renderMedia.mockRejectedValueOnce(new Error('render failed'));
      if (stage === 'mux') mocks.muxChunks.mockRejectedValueOnce(new Error('mux failed'));
      await expect(renderVideo(job, options())).rejects.toThrow(`${stage} failed`);
      expect(await readFile(job.outputLocation, 'utf8')).toBe('previous export');
      expect(await readdir(dir)).toEqual(['out.mp4']);
    },
  );

  test('cancels the current video chunk when the parallel audio encode fails', async () => {
    const pending = Promise.withResolvers<void>();
    const cancel = () => pending.reject(new Error('cancelled video'));
    mocks.renderMedia.mockImplementation(({ cancelSignal }) => {
      cancelSignal(cancel);
      return pending.promise;
    });
    mocks.encodeMasterAudio.mockRejectedValueOnce(new Error('audio failed'));
    await expect(renderVideo(job, options())).rejects.toThrow('audio failed');
    expect(mocks.renderMedia).toHaveBeenCalledOnce();
    expect(mocks.muxChunks).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  test('stops the audio encoder and waits for it before cleaning up a failed render', async () => {
    const stopped = vi.fn();
    const pending = Promise.withResolvers<void>();
    const cancel = () => {
      stopped();
      pending.reject(new Error('cancelled audio'));
    };
    mocks.encodeMasterAudio.mockImplementation(({ signal }) => {
      signal.addEventListener('abort', cancel);
      return pending.promise;
    });
    mocks.renderMedia.mockRejectedValueOnce(new Error('video failed'));
    await expect(renderVideo(job, options())).rejects.toThrow('video failed');
    expect(stopped).toHaveBeenCalledOnce();
    expect(await readdir(dir)).toEqual([]);
  });
});
