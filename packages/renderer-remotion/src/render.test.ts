import { normalizeMix } from '@setcast/core';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';

const remotion = vi.hoisted(() => ({
  bundle: vi.fn(),
  openBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  ensureBrowser: vi.fn(),
  renderVideo: vi.fn(),
  selectComposition: vi.fn(),
}));

const audio = vi.hoisted(() => ({ probe: vi.fn() }));
const hardware = vi.hoisted(() => ({ encoding: vi.fn() }));
const localServer = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock('@remotion/bundler', () => ({ bundle: remotion.bundle }));
vi.mock('@remotion/renderer', () => ({
  ensureBrowser: remotion.ensureBrowser,
  openBrowser: remotion.openBrowser,
  selectComposition: remotion.selectComposition,
}));
vi.mock('./chunks.ts', async () => ({
  resolveChunkSeconds: (await import('@setcast/core')).resolveChunkSeconds,
  renderVideo: (job: unknown) => remotion.renderVideo(job),
}));
vi.mock('./probe.ts', () => ({ probeAudio: audio.probe }));
vi.mock('./hardware.ts', () => ({ hardwareEncoding: hardware.encoding }));
vi.mock('./local-server.ts', () => ({ checkLocalServer: localServer.check }));

const { render, withRenderSession } = await import('./index.ts');

const project: ResolvedProject = {
  title: 'Test',
  audio: 'audio.wav',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  mix: normalizeMix({}, 10),
  presentation: 'playlist',
  modulation: [],
  visualizers: [{ name: 'spectrum' }],
  envelope: null,
  travel: null,
  panel: { dwell: 14, fade: 1.2 },
  tracklist: null,
  bpm: null,
  beatOffset: 0,
  clockOffset: 0,
  clockTotal: null,
};

const run = () => render(project, { projectDir: '.', out: 'out.mp4' });

describe('render orchestration failures', () => {
  beforeEach(() => {
    remotion.closeBrowser.mockReset().mockResolvedValue(undefined);
    remotion.openBrowser.mockReset().mockResolvedValue({ close: remotion.closeBrowser });
    audio.probe.mockReset().mockResolvedValue(10);
    hardware.encoding
      .mockReset()
      .mockImplementation(async (hardwareAcceleration) => ({ hardwareAcceleration }));
    localServer.check.mockReset().mockResolvedValue(undefined);
    remotion.bundle.mockReset().mockResolvedValue('http://localhost:3000');
    remotion.ensureBrowser.mockReset().mockResolvedValue({
      type: 'local-puppeteer-browser',
      path: '/browser',
    });
    remotion.selectComposition.mockReset().mockResolvedValue({ fps: 30, durationInFrames: 300 });
    remotion.renderVideo.mockReset().mockResolvedValue(undefined);
  });

  test('shares browser, bundle, and metadata within a batch and cleans up on failure', async () => {
    await expect(
      withRenderSession(async () => {
        await run();
        remotion.renderVideo.mockRejectedValueOnce(new Error('second failed'));
        await run();
      }),
    ).rejects.toThrow('second failed');
    expect(remotion.bundle).toHaveBeenCalledOnce();
    expect(remotion.openBrowser).toHaveBeenCalledOnce();
    expect(remotion.selectComposition).toHaveBeenCalledOnce();
    expect(remotion.closeBrowser).toHaveBeenCalledOnce();
  });

  test('new theme props get fresh metadata without rebuilding the batch bundle', async () => {
    await withRenderSession(async () => {
      await run();
      await render(
        { ...project, theme: 'other', css: 'body {color:red}' },
        { projectDir: '.', out: 'other.mp4' },
      );
    });
    expect(remotion.bundle).toHaveBeenCalledOnce();
    expect(remotion.selectComposition).toHaveBeenCalledTimes(2);
    expect(remotion.renderVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputProps: expect.objectContaining({ theme: 'other' }) }),
    );
  });

  test('probes audio before preparing the browser', async () => {
    audio.probe.mockRejectedValue(new Error('bad audio'));
    await expect(run()).rejects.toThrow('bad audio');
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });

  test('uses the selected graphics backend for metadata and rendered frames', async () => {
    await render(project, { projectDir: '.', out: 'out.mp4', gl: 'swangle' });
    const graphics = { chromiumOptions: { gl: 'swangle' } };
    expect(remotion.selectComposition).toHaveBeenCalledWith(expect.objectContaining(graphics));
    expect(remotion.renderVideo).toHaveBeenCalledWith(expect.objectContaining(graphics));
  });

  test('defaults to software CRF 18 and JPEG quality 95', async () => {
    await run();
    expect(remotion.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({ crf: 18, hardwareAcceleration: 'disable', jpegQuality: 95 }),
    );
  });

  test('forwards the serial encoding opt-out', async () => {
    await render(project, { projectDir: '.', out: 'out.mp4', parallelEncoding: false });
    expect(remotion.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({ disallowParallelEncoding: true }),
    );
  });

  test.each(['disable', 'if-possible', 'required'] as const)(
    'forwards bitrate encoding with %s hardware acceleration and no CRF',
    async (hardwareAcceleration) => {
      await render(project, {
        projectDir: '.',
        out: 'out.mp4',
        hardwareAcceleration,
        videoBitrate: '12M',
      });
      expect(remotion.renderVideo).toHaveBeenCalledWith(
        expect.objectContaining({ hardwareAcceleration, videoBitrate: '12M', crf: null }),
      );
    },
  );

  test('renders in software when the hardware encoder cannot start', async () => {
    hardware.encoding.mockResolvedValue({ hardwareAcceleration: 'disable', fallback: 'no device' });
    await render(project, {
      projectDir: '.',
      out: 'out.mp4',
      hardwareAcceleration: 'if-possible',
      videoBitrate: '12M',
    });
    expect(remotion.renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({ hardwareAcceleration: 'disable', videoBitrate: '12M', crf: null }),
    );
  });

  test('checks the hardware encoder before audio or browser work', async () => {
    hardware.encoding.mockRejectedValue(new Error('Cannot encode with h264_nvenc'));
    await expect(
      render(project, {
        projectDir: '.',
        out: 'out.mp4',
        hardwareAcceleration: 'required',
        videoBitrate: '12M',
      }),
    ).rejects.toThrow('Cannot encode with h264_nvenc');
    expect(audio.probe).not.toHaveBeenCalled();
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });

  test('resolves the fast profile for direct API renders and honors explicit quality settings', async () => {
    await render(project, { projectDir: '.', out: 'out.mp4', profile: 'fast' });
    expect(remotion.renderVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({ jpegQuality: 92, x264Preset: 'veryfast', crf: 18 }),
    );
    await render(project, {
      projectDir: '.',
      out: 'out.mp4',
      profile: 'fast',
      jpegQuality: 96,
      x264Preset: 'slow',
    });
    expect(remotion.renderVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({ jpegQuality: 96, x264Preset: 'slow' }),
    );
  });

  test.each([
    { crf: 18, videoBitrate: '12M' as const },
    { hardwareAcceleration: 'required' as const },
    {
      hardwareAcceleration: 'required' as const,
      videoBitrate: '12M' as const,
      x264Preset: 'veryfast' as const,
    },
  ])('rejects invalid encoding options before audio or browser work: %j', async (options) => {
    await expect(render(project, { projectDir: '.', out: 'out.mp4', ...options })).rejects.toThrow(
      'Invalid video encoding settings',
    );
    expect(audio.probe).not.toHaveBeenCalled();
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });

  test('stops when browser preparation fails', async () => {
    remotion.ensureBrowser.mockRejectedValue(new Error('browser failed'));
    await expect(run()).rejects.toThrow('browser failed');
    expect(remotion.bundle).not.toHaveBeenCalled();
  });

  test('rejects invalid chunk sizes before audio or browser work', async () => {
    await expect(
      render(project, { projectDir: '.', out: 'out.mp4', chunkSeconds: -1 }),
    ).rejects.toThrow('Invalid render chunkSeconds');
    expect(audio.probe).not.toHaveBeenCalled();
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });

  test('checks local server access before starting browser and compositor work', async () => {
    localServer.check.mockRejectedValue(new Error('local server denied'));
    await expect(run()).rejects.toThrow('local server denied');
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
    expect(remotion.selectComposition).not.toHaveBeenCalled();
  });

  test('translates a browser download failure', async () => {
    remotion.ensureBrowser.mockImplementation(async ({ onBrowserDownload }) => {
      onBrowserDownload();
      throw new Error('network unavailable');
    });
    await expect(run()).rejects.toMatchObject({
      message: 'Cannot download Chrome Headless Shell',
      cause: expect.objectContaining({ message: 'network unavailable' }),
    });
  });

  test('stops when bundling fails', async () => {
    remotion.bundle.mockRejectedValue(new Error('bundle failed'));
    await expect(run()).rejects.toThrow('bundle failed');
    expect(remotion.selectComposition).not.toHaveBeenCalled();
  });

  test('stops when composition selection fails', async () => {
    remotion.selectComposition.mockRejectedValue(new Error('selection failed'));
    await expect(run()).rejects.toThrow('selection failed');
    expect(remotion.renderVideo).not.toHaveBeenCalled();
  });

  test('explains local server failures during composition selection', async () => {
    remotion.selectComposition.mockRejectedValue(new Error('No available ports found'));
    await expect(run()).rejects.toMatchObject({
      message: "Cannot start the renderer's local HTTP server",
      hint: expect.stringContaining('localhost port'),
      exitCode: 1,
      cause: expect.objectContaining({ message: 'No available ports found' }),
    });
    expect(remotion.renderVideo).not.toHaveBeenCalled();
  });

  test('propagates encoding failures', async () => {
    remotion.renderVideo.mockRejectedValue(new Error('encode failed'));
    await expect(run()).rejects.toThrow('encode failed');
  });

  test('translates image failures and delayRender timeouts', async () => {
    remotion.renderVideo.mockRejectedValueOnce(new Error('Failed to load http://x/bg.png'));
    await expect(run()).rejects.toMatchObject({
      message: 'Cannot read http://x/bg.png as an image',
      cause: expect.any(Error),
    });

    remotion.renderVideo.mockRejectedValueOnce(
      new Error(
        'A delayRender() "asset:http://x/bg.png" was called but not cleared after 28000ms.',
      ),
    );
    await expect(run()).rejects.toMatchObject({
      message: 'Render timed out waiting for asset:http://x/bg.png',
      hint: expect.stringContaining('--concurrency'),
      cause: expect.any(Error),
    });
  });

  test('rejects an unsupported video extension before browser preparation', async () => {
    await expect(render(project, { projectDir: '.', out: 'out.avi' })).rejects.toThrow(
      /Cannot write video to .*out\.avi/,
    );
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });
});
