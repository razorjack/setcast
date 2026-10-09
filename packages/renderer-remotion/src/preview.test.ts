import { normalizeMix } from '@setcast/core';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ResolvedProject } from '@setcast/core';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
const fs = vi.hoisted(() => ({
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));
vi.mock('node:fs/promises', () => fs);

const { preview } = await import('./index.ts');

const project: ResolvedProject = {
  title: 'Test',
  audio: 'audio.wav',
  background: null,
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
  panel: { dwell: 14, fade: 1.2 },
  bpm: null,
  beatOffset: 0,
  clockOffset: 0,
  clockTotal: null,
};

const exitWith = (code: number | null, signal: NodeJS.Signals | null = null) => {
  childProcess.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', code, signal));
    return child;
  });
};

describe('preview process', () => {
  beforeEach(() => {
    fs.mkdtemp.mockReset().mockResolvedValue('/tmp/setcast-preview-test');
    fs.writeFile.mockReset().mockResolvedValue(undefined);
    fs.rm.mockReset().mockResolvedValue(undefined);
    childProcess.spawn.mockReset();
  });

  test('resolves on a clean exit and removes temporary props', async () => {
    exitWith(0);
    await expect(preview(project, { projectDir: '/project' })).resolves.toBeUndefined();
    expect(fs.rm).toHaveBeenCalledWith('/tmp/setcast-preview-test', {
      recursive: true,
      force: true,
    });
  });

  test('reports non-zero exits', async () => {
    exitWith(2);
    await expect(preview(project, { projectDir: '/project' })).rejects.toThrow(
      'stopped with exit code 2',
    );
    expect(fs.rm).toHaveBeenCalledOnce();
  });

  test('passes an explicit graphics backend to Studio', async () => {
    exitWith(0);
    await preview(project, { projectDir: '/project', gl: 'swangle' });
    expect(childProcess.spawn.mock.calls[0]![1]).toEqual(
      expect.arrayContaining(['--gl', 'swangle']),
    );
  });

  test('passes hardware bitrate settings to Studio without a conflicting CRF', async () => {
    exitWith(0);
    await preview(project, {
      projectDir: '/project',
      hardwareAcceleration: 'required',
      videoBitrate: '12M',
      jpegQuality: 98,
    });
    const args = childProcess.spawn.mock.calls[0]![1];
    expect(args).toEqual(
      expect.arrayContaining([
        '--hardware-acceleration',
        'required',
        '--video-bitrate',
        '12M',
        '--jpeg-quality',
        '98',
      ]),
    );
    expect(args).not.toContain('--crf');
  });

  test('uses the same software quality defaults for Studio and CLI renders', async () => {
    exitWith(0);
    await preview(project, { projectDir: '/project' });
    const args = childProcess.spawn.mock.calls[0]![1];
    expect(args).toEqual(
      expect.arrayContaining(['--crf', '18', '--hardware-acceleration', 'disable']),
    );
    expect(args).not.toContain('--video-bitrate');
  });

  test('reports terminating signals', async () => {
    exitWith(null, 'SIGTERM');
    await expect(preview(project, { projectDir: '/project' })).rejects.toThrow(
      'stopped after SIGTERM',
    );
    expect(fs.rm).toHaveBeenCalledOnce();
  });
});
