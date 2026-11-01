import { mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import type { Envelope } from '../audio/analysis.ts';
import { summarizeEnvelope, travelOf } from '../audio/analysis.ts';
import type { ResolvedProject } from '../project.ts';
import { resolveVisualizerConfigs } from '../visualizers.ts';
import { readSetEnergy } from './audio.ts';
import { WholeSetReader } from './whole-set-reader.ts';

vi.mock('./audio.ts', async (original) => ({
  ...(await original<typeof import('./audio.ts')>()),
  readSetEnergy: vi.fn(),
}));

const energy: Envelope = { hop: 0.05, bass: [0, 0.2, 1], high: [0.5, 0.1, 0], flux: [0, 0.2, 0.8] };
const decode = vi.mocked(readSetEnergy);
let dir: string;

function project(overrides: Partial<ResolvedProject> = {}): ResolvedProject {
  return {
    audio: 'audio.wav',
    css: 'a { transform: translateX(calc(var(--travel-bass) * 1px)); }',
    visualizers: resolveVisualizerConfigs({ name: 'overview' }),
    envelope: null,
    travel: null,
    ...overrides,
  } as ResolvedProject;
}

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'setcast-whole-set-')));
  await writeFile(join(dir, 'audio.wav'), 'original');
  decode.mockReset().mockResolvedValue(energy);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('shares preparation across concurrent reads and theme changes without sharing mutable arrays', async () => {
  const reader = new WholeSetReader();
  const [first, second] = await Promise.all([
    reader.read(project(), dir),
    reader.read(project(), dir),
  ]);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(first.envelope).toEqual(summarizeEnvelope(energy));
  expect(first.travel).toEqual(travelOf(energy));
  first.envelope!.bass[0] = 99;
  first.travel!.high[0] = 99;
  expect(second.envelope).toEqual(summarizeEnvelope(energy));
  expect(second.travel).toEqual(travelOf(energy));
  const travel = await reader.read(project({ visualizers: [] }), dir);
  expect(travel.envelope).toBeNull();
  expect(travel.travel).toEqual(travelOf(energy));
  const overview = await reader.read(project({ css: '' }), dir);
  expect(overview.envelope).toEqual(summarizeEnvelope(energy));
  expect(overview.travel).toBeNull();
  expect(decode).toHaveBeenCalledTimes(1);
});

test('does not access audio when the project has no whole-set consumers', async () => {
  const input = project({ audio: 'absent.wav', visualizers: [], css: '' });
  expect(await new WholeSetReader().read(input, dir)).toBe(input);
  expect(decode).not.toHaveBeenCalled();
});

test('resolves aliases to the same source and invalidates modified or replaced files', async () => {
  const reader = new WholeSetReader();
  await symlink(join(dir, 'audio.wav'), join(dir, 'alias.wav'));
  await reader.read(project(), dir);
  await reader.read(project({ audio: 'alias.wav' }), dir);
  expect(decode).toHaveBeenCalledTimes(1);
  await writeFile(join(dir, 'audio.wav'), 'changed source');
  await reader.read(project(), dir);
  expect(decode).toHaveBeenCalledTimes(2);
  await writeFile(join(dir, 'replacement.wav'), 'changed source');
  await rename(join(dir, 'replacement.wav'), join(dir, 'audio.wav'));
  await reader.read(project(), dir);
  expect(decode).toHaveBeenCalledTimes(3);
});

test('retains only the latest source', async () => {
  const reader = new WholeSetReader();
  await writeFile(join(dir, 'other.wav'), 'other');
  await reader.read(project(), dir);
  await reader.read(project({ audio: 'other.wav' }), dir);
  await reader.read(project(), dir);
  expect(decode).toHaveBeenCalledTimes(3);
});

test('retries failed preparation without caching the failure', async () => {
  const reader = new WholeSetReader();
  const failure = new Error('decoder failed');
  decode.mockRejectedValueOnce(failure);
  await expect(reader.read(project(), dir)).rejects.toBe(failure);
  expect((await reader.read(project(), dir)).travel).toEqual(travelOf(energy));
  expect(decode).toHaveBeenCalledTimes(2);
});

test('rejects a source changed during preparation and allows retry', async () => {
  const reader = new WholeSetReader();
  decode.mockImplementationOnce(async () => {
    await writeFile(join(dir, 'audio.wav'), 'changed while decoding');
    return energy;
  });
  await expect(reader.read(project(), dir)).rejects.toMatchObject({
    message: `Audio changed while preparing ${join(dir, 'audio.wav')}.`,
    hint: 'Wait for the audio file to finish writing, then reload the project.',
  });
  expect((await reader.read(project(), dir)).envelope).toEqual(summarizeEnvelope(energy));
  expect(decode).toHaveBeenCalledTimes(2);
});
