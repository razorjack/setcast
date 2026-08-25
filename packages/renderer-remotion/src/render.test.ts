import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';

const remotion = vi.hoisted(() => ({
  bundle: vi.fn(),
  ensureBrowser: vi.fn(),
  renderMedia: vi.fn(),
  selectComposition: vi.fn(),
}));

vi.mock('@remotion/bundler', () => ({ bundle: remotion.bundle }));
vi.mock('@remotion/renderer', () => ({
  ensureBrowser: remotion.ensureBrowser,
  renderMedia: remotion.renderMedia,
  selectComposition: remotion.selectComposition,
}));

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
  visualizer: { name: 'spectrum' },
  panel: { dwell: 14, fade: 1.2 },
};

const run = () => render(project, { projectDir: '.', out: 'out.mp4' });

describe('render orchestration failures', () => {
  beforeEach(() => {
    remotion.bundle.mockReset().mockResolvedValue('http://localhost:3000');
    remotion.ensureBrowser.mockReset().mockResolvedValue({
      type: 'local-puppeteer-browser',
      path: '/browser',
    });
    remotion.selectComposition.mockReset().mockResolvedValue({ fps: 30, durationInFrames: 300 });
    remotion.renderMedia.mockReset().mockResolvedValue(undefined);
  });

  test('stops when browser preparation fails', async () => {
    remotion.ensureBrowser.mockRejectedValue(new Error('browser failed'));
    await expect(run()).rejects.toThrow('browser failed');
    expect(remotion.bundle).not.toHaveBeenCalled();
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

  test('propagates encoding failures', async () => {
    remotion.renderMedia.mockRejectedValue(new Error('encode failed'));
    await expect(run()).rejects.toThrow('encode failed');
  });
});
