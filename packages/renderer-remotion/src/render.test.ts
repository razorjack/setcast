import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';

const remotion = vi.hoisted(() => ({
  bundle: vi.fn(),
  ensureBrowser: vi.fn(),
  renderMedia: vi.fn(),
  selectComposition: vi.fn(),
}));

const audio = vi.hoisted(() => ({ probe: vi.fn() }));
const localServer = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock('@remotion/bundler', () => ({ bundle: remotion.bundle }));
vi.mock('@remotion/renderer', () => ({
  ensureBrowser: remotion.ensureBrowser,
  renderMedia: remotion.renderMedia,
  selectComposition: remotion.selectComposition,
}));
vi.mock('./probe.ts', () => ({ probeAudio: audio.probe }));
vi.mock('./local-server.ts', () => ({ checkLocalServer: localServer.check }));

const { render } = await import('./index.ts');

const project: ResolvedProject = {
  title: 'Test',
  audio: 'audio.wav',
  background: null,
  theme: 'test',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  events: [],
  modulation: [],
  visualizers: [{ name: 'spectrum' }],
  envelope: null,
  panel: { dwell: 14, fade: 1.2 },
  bpm: null,
  beatOffset: 0,
  clockOffset: 0,
  clockTotal: null,
  trackNumberOffset: 0,
};

const run = () => render(project, { projectDir: '.', out: 'out.mp4' });

describe('render orchestration failures', () => {
  beforeEach(() => {
    audio.probe.mockReset().mockResolvedValue(10);
    localServer.check.mockReset().mockResolvedValue(undefined);
    remotion.bundle.mockReset().mockResolvedValue('http://localhost:3000');
    remotion.ensureBrowser.mockReset().mockResolvedValue({
      type: 'local-puppeteer-browser',
      path: '/browser',
    });
    remotion.selectComposition.mockReset().mockResolvedValue({ fps: 30, durationInFrames: 300 });
    remotion.renderMedia.mockReset().mockResolvedValue(undefined);
  });

  test('probes audio before preparing the browser', async () => {
    audio.probe.mockRejectedValue(new Error('bad audio'));
    await expect(run()).rejects.toThrow('bad audio');
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });

  test('stops when browser preparation fails', async () => {
    remotion.ensureBrowser.mockRejectedValue(new Error('browser failed'));
    await expect(run()).rejects.toThrow('browser failed');
    expect(remotion.bundle).not.toHaveBeenCalled();
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
    expect(remotion.renderMedia).not.toHaveBeenCalled();
  });

  test('explains local server failures during composition selection', async () => {
    remotion.selectComposition.mockRejectedValue(new Error('No available ports found'));
    await expect(run()).rejects.toMatchObject({
      message: "Cannot start the renderer's local HTTP server",
      hint: expect.stringContaining('localhost port'),
      exitCode: 1,
      cause: expect.objectContaining({ message: 'No available ports found' }),
    });
    expect(remotion.renderMedia).not.toHaveBeenCalled();
  });

  test('propagates encoding failures', async () => {
    remotion.renderMedia.mockRejectedValue(new Error('encode failed'));
    await expect(run()).rejects.toThrow('encode failed');
  });

  test('translates image failures and delayRender timeouts', async () => {
    remotion.renderMedia.mockRejectedValueOnce(new Error('Failed to load http://x/bg.png'));
    await expect(run()).rejects.toMatchObject({
      message: 'Cannot read http://x/bg.png as an image',
      cause: expect.any(Error),
    });

    remotion.renderMedia.mockRejectedValueOnce(
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
      'Cannot write video to out.avi',
    );
    expect(remotion.ensureBrowser).not.toHaveBeenCalled();
  });
});
