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
  events: [],
  modulation: [],
  visualizer: { name: 'spectrum' },
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
      'exited with code 2',
    );
    expect(fs.rm).toHaveBeenCalledOnce();
  });

  test('reports terminating signals', async () => {
    exitWith(null, 'SIGTERM');
    await expect(preview(project, { projectDir: '/project' })).rejects.toThrow(
      'terminated by SIGTERM',
    );
    expect(fs.rm).toHaveBeenCalledOnce();
  });
});
