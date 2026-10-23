import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { framesWithinMix, resolveFrameRange, type ResolvedProject } from '@setcast/core';
import { AUDIO_CHECK, audioAlignment } from './audio-alignment.ts';
import { digestFile } from '../../src/export/fingerprint.ts';
import { encoderVersion } from '../../src/export/probe.ts';
import type { EnduranceConfig } from './config.ts';
import type { EnduranceReport } from './report.ts';

const execute = promisify(execFile);
type Stream = {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  duration?: string;
};

export async function verifyExport(
  file: string,
  source: { project: ResolvedProject; dir: string },
  run: { config: EnduranceConfig; report: EnduranceReport },
  signal: AbortSignal,
) {
  const started = performance.now();
  const { config, report } = run;
  const { project, dir } = source;
  const expected = expectedExport(project, config);
  const checks = {
    mode: config.verification,
    expected,
    phase: 'identity',
    video: null as null | Awaited<ReturnType<typeof inspectVideo>>,
    audio: [] as { at: number; result: ReturnType<typeof audioAlignment> }[],
    audioAt:
      config.audioAt ??
      [0, 0.02, 0.25, 0.5, 0.75, 1].map(
        (fraction) => 0.25 + fraction * (expected.frames / expected.fps - 1.5),
      ),
    wallSeconds: 0,
  };
  report.report.details.verification = checks;
  try {
    if (checks.audioAt.some((at) => at + 1.05 > expected.frames / expected.fps))
      throw new Error(
        'audioAt windows must end at least 0.05 seconds before the rounded export duration. Each window lasts one second.',
      );
    const identity = await verificationIdentity(file, resolve(dir, project.audio), signal);
    report.report.details.identity = identity;
    checks.phase = 'video';
    await report.checkpoint();
    checks.video = await inspectVideo(file, config.verification === 'decoded', expected, signal);
    await report.checkpoint();
    if (checks.video.errors.length) throw new Error(checks.video.errors.join(' '));
    if (config.verification === 'decoded') {
      checks.phase = 'audio';
      await verifyAudio(file, resolve(dir, project.audio), { checks, report }, signal);
    }
    await unchangedInputs(identity);
    checks.phase = 'complete';
  } finally {
    checks.wallSeconds = (performance.now() - started) / 1000;
    await report.checkpoint();
  }
}

function expectedExport(project: ResolvedProject, config: EnduranceConfig) {
  const range = resolveFrameRange(
    [config.at, config.at + config.seconds],
    project.fps,
    framesWithinMix(project.mix.duration, project.fps),
  );
  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    frames: range[1] - range[0] + 1,
    sourceAt: range[0] / project.fps,
  };
}

async function verificationIdentity(file: string, source: string, signal: AbortSignal) {
  const versions = await encoderVersion(signal);
  return {
    ffmpeg: versions.ffmpeg.split('\n')[0],
    ffprobe: versions.ffprobe.split('\n')[0],
    output: { path: file, ...(await digestFile(file, signal)) },
    source: { path: source, ...(await digestFile(source, signal)) },
  };
}

async function unchangedInputs(identity: Awaited<ReturnType<typeof verificationIdentity>>) {
  for (const input of [identity.source, identity.output]) {
    const info = await stat(input.path);
    const stamp = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if (stamp !== input.stamp)
      throw new Error(
        `Media changed during verification: ${input.path}. Keep inputs unchanged and run again.`,
      );
  }
}

async function verifyAudio(
  file: string,
  source: string,
  state: {
    checks: {
      expected: ReturnType<typeof expectedExport>;
      audio: { at: number; result: ReturnType<typeof audioAlignment> }[];
      audioAt: number[];
    };
    report: EnduranceReport;
  },
  signal: AbortSignal,
) {
  const { checks, report } = state;
  for (const at of checks.audioAt) {
    const reference = await decodeAudio(source, checks.expected.sourceAt + at, signal);
    const actual = await decodeAudio(file, at, signal);
    const result = audioAlignment(reference, actual);
    checks.audio.push({ at, result });
    await report.event('action', { name: 'audio-verification', at, ...result });
    await report.checkpoint();
  }
  const failures = checks.audio.filter((check) => check.result.status !== 'passed');
  if (failures.length)
    throw new Error(
      `Audio alignment is not qualified at ${failures.map((check) => `${check.at.toFixed(3)}s (${check.result.status})`).join(', ')}. See report verification details.`,
    );
}

async function inspectVideo(
  file: string,
  decoded: boolean,
  expected: { width: number; height: number; fps: number; frames: number },
  signal: AbortSignal,
) {
  const { stdout, stderr } = await execute(
    'ffprobe',
    ['-v', 'error', ...(decoded ? ['-count_frames'] : []), '-show_streams', '-of', 'json', file],
    { signal, maxBuffer: 1024 * 1024 },
  );
  const streams = JSON.parse(stdout).streams as Stream[];
  const errors = videoErrors(streams, decoded, expected);
  if (stderr.trim()) errors.push(`Decoder reported errors: ${stderr.trim()}`);
  return { streams, errors };
}

function videoErrors(
  streams: Stream[],
  decoded: boolean,
  expected: { width: number; height: number; fps: number; frames: number },
) {
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const errors: string[] = [];
  if (!video) return ['Export has no video stream.'];
  const [numerator, denominator] = (video.avg_frame_rate ?? '').split('/').map(Number);
  if (Number(decoded ? video.nb_read_frames : video.nb_frames) !== expected.frames)
    errors.push('Export frame count differs from the planned range.');
  if (video.width !== expected.width || video.height !== expected.height)
    errors.push('Export dimensions differ from the project.');
  if (numerator! / denominator! !== expected.fps)
    errors.push('Export frame rate differs from the project.');
  for (const stream of [video, audio])
    if (
      stream &&
      !(Math.abs(Number(stream.duration) - expected.frames / expected.fps) < 1 / expected.fps)
    )
      errors.push(`Export ${stream.codec_type} duration differs from the planned range.`);
  if (!audio) errors.push('Export has no master audio stream.');
  return errors;
}

async function decodeAudio(file: string, at: number, signal: AbortSignal) {
  const { sampleRate, searchSamples, windowSamples, channels } = AUDIO_CHECK;
  const seconds = (windowSamples + 2 * searchSamples) / sampleRate;
  const { stdout, stderr } = await execute(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(at - searchSamples / sampleRate),
      '-i',
      file,
      '-t',
      String(seconds),
      '-vn',
      '-ac',
      String(channels),
      '-ar',
      String(sampleRate),
      '-f',
      'f32le',
      'pipe:1',
    ],
    { signal, encoding: 'buffer', maxBuffer: 1024 * 1024 },
  );
  if (stderr.length) throw new Error(`Audio decoder reported errors: ${stderr.toString()}`);
  const samples = new Float32Array(stdout.length / 4);
  for (let index = 0; index < samples.length; index++)
    samples[index] = stdout.readFloatLE(index * 4);
  return samples;
}
