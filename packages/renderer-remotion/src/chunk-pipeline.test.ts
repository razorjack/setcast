import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ChunkJob } from './chunk-pipeline.ts';

const mocks = vi.hoisted(() => ({ renderFrames: vi.fn(), runFfmpeg: vi.fn() }));
vi.mock('@remotion/renderer', async (original) => ({
  ...(await original<typeof import('@remotion/renderer')>()),
  renderFrames: mocks.renderFrames,
}));
vi.mock('./ffmpeg.ts', () => ({ runFfmpeg: mocks.runFfmpeg }));
const { canPipeline, renderChunkPipeline } = await import('./chunk-pipeline.ts');

describe('bounded chunk pipeline', () => {
  let directory: string;
  let jobs: ChunkJob[];
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'setcast-pipeline-test-'));
    jobs = [0, 1, 2].map((index) => ({
      codec: 'h264',
      serveUrl: '/bundle',
      outputLocation: join(directory, `chunk-${index}.mp4`),
      frameRange: [1800 + 30 * index, 1829 + 30 * index],
      composition: { width: 1920, height: 1080, fps: 30 } as ChunkJob['composition'],
      crf: 18,
      jpegQuality: 92,
      x264Preset: 'veryfast',
    }));
    mocks.renderFrames.mockReset().mockImplementation(async (options) => {
      options.onFrameUpdate(30);
      return {
        assetsInfo: {
          imageSequenceName: join(options.outputDir, 'element-%04d.jpeg'),
          firstFrameIndex: options.frameRange[0],
        },
      };
    });
    mocks.runFfmpeg.mockReset().mockResolvedValue(undefined);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('overlaps capture with one encoder and bounds retained sequences to two', async () => {
    const encoders = jobs.map(() => Promise.withResolvers<void>());
    let index = 0;
    mocks.runFfmpeg.mockImplementation(() => encoders[index++]!.promise);
    const rendering = renderChunkPipeline(jobs, new AbortController().signal, () => {});
    await vi.waitFor(() => expect(mocks.renderFrames).toHaveBeenCalledTimes(2));
    expect(mocks.runFfmpeg).toHaveBeenCalledTimes(1);
    expect((await readdir(directory)).sort()).toEqual(['frames-0', 'frames-1']);
    encoders[0]!.resolve();
    await vi.waitFor(() => expect(mocks.renderFrames).toHaveBeenCalledTimes(3));
    expect(mocks.runFfmpeg).toHaveBeenCalledTimes(2);
    expect((await readdir(directory)).sort()).toEqual(['frames-1', 'frames-2']);
    encoders[1]!.resolve();
    await vi.waitFor(() => expect(mocks.runFfmpeg).toHaveBeenCalledTimes(3));
    encoders[2]!.resolve();
    await rendering;
    expect(await readdir(directory)).toEqual([]);
  });

  test('encoder failure cancels and settles an in-flight capture', async () => {
    const encoder = Promise.withResolvers<void>();
    const failure = new Error('encoder failed');
    const capture = Promise.withResolvers<void>();
    const cancelCapture = vi.fn(() => capture.reject(new Error('capture cancelled')));
    mocks.runFfmpeg.mockImplementation(() => encoder.promise);
    mocks.renderFrames
      .mockImplementationOnce(async (options) => ({
        assetsInfo: {
          imageSequenceName: join(options.outputDir, 'frame-%04d.jpeg'),
          firstFrameIndex: 1800,
        },
      }))
      .mockImplementationOnce(({ cancelSignal }) => {
        cancelSignal(cancelCapture);
        return capture.promise;
      });
    const rendering = renderChunkPipeline(jobs, new AbortController().signal, () => {});
    const rejected = expect(rendering).rejects.toBe(failure);
    await vi.waitFor(() => expect(mocks.renderFrames).toHaveBeenCalledTimes(2));
    encoder.reject(failure);
    await rejected;
    expect(cancelCapture).toHaveBeenCalledOnce();
    expect(mocks.renderFrames).toHaveBeenCalledTimes(2);
  });

  test('capture failure cancels and settles the active encoder', async () => {
    const failure = new Error('capture failed');
    const encoder = Promise.withResolvers<void>();
    const stopEncoder = vi.fn(() => encoder.reject(new Error('encoder cancelled')));
    const stopCapture = vi.fn();
    mocks.runFfmpeg.mockImplementation((_args, { signal }) => {
      signal.addEventListener('abort', stopEncoder, { once: true });
      return encoder.promise;
    });
    mocks.renderFrames
      .mockImplementationOnce(async (options) => ({
        assetsInfo: {
          imageSequenceName: join(options.outputDir, 'frame-%04d.jpeg'),
          firstFrameIndex: 1800,
        },
      }))
      .mockImplementationOnce(({ cancelSignal }) => {
        cancelSignal(stopCapture);
        return Promise.reject(failure);
      });
    await expect(renderChunkPipeline(jobs, new AbortController().signal, () => {})).rejects.toBe(
      failure,
    );
    expect(stopEncoder).toHaveBeenCalledOnce();
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(mocks.renderFrames).toHaveBeenCalledTimes(2);
  });

  test('preserves absolute frame numbering, capture quality and bitrate encoding', async () => {
    const job = { ...jobs[0]!, videoBitrate: '12M', crf: null };
    await renderChunkPipeline([job], new AbortController().signal, () => {});
    expect(mocks.renderFrames).toHaveBeenCalledWith(
      expect.objectContaining({
        frameRange: [1800, 1829],
        imageFormat: 'jpeg',
        jpegQuality: 92,
      }),
    );
    const args = mocks.runFfmpeg.mock.calls[0]![0];
    expect(args).toEqual(
      expect.arrayContaining([
        '-start_number',
        '1800',
        '-frames:v',
        '30',
        '-preset',
        'veryfast',
        '-b:v',
        '12M',
      ]),
    );
    expect(args).not.toContain('-crf');
  });

  test('keeps specialized encoder settings and explicit opt-out on the existing path', () => {
    expect(canPipeline(jobs[0]!)).toBe(true);
    for (const options of [
      { disallowParallelEncoding: true },
      { hardwareAcceleration: 'required' as const },
      { colorSpace: 'bt709' as const },
      { pixelFormat: 'yuv444p' as const },
    ]) {
      expect(canPipeline({ ...jobs[0]!, ...options })).toBe(false);
    }
    expect(
      canPipeline({ ...jobs[0]!, composition: { ...jobs[0]!.composition, width: 1919 } }),
    ).toBe(false);
  });
});
