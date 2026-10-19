import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { FPS, FRAME_COUNT, FIRST_FRAME, PULSES, SAMPLE_RATE } from './fixture.ts';

interface Stream {
  codec_type: string;
  codec_name: string;
  duration: string;
  nb_read_frames: string;
  avg_frame_rate: string;
  width?: number;
  height?: number;
}

export function decode(file: string, args: string[]): Buffer {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, ...args, 'pipe:1'], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function pixels(file: string): Buffer {
  return decode(file, ['-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24']);
}

export function checkTracks(file: string): void {
  const { streams } = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file],
      { encoding: 'utf8' },
    ),
  ) as { streams: Stream[] };
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  assert.equal(video?.codec_name, 'h264');
  assert.equal(audio?.codec_name, 'aac');
  assert.equal(Number(video.nb_read_frames), FRAME_COUNT);
  assert.equal(video.avg_frame_rate, `${FPS}/1`);
  assert.equal(video.width, 640);
  assert.equal(video.height, 360);
  assert(Math.abs(Number(video.duration) - FRAME_COUNT / FPS) < 0.001);
  assert(
    Math.abs(Number(audio.duration) - FRAME_COUNT / FPS) < 0.1,
    'AAC padding exceeds tolerance',
  );
}

export function starts(values: number[], threshold: number): number[] {
  return values.flatMap((value, index) =>
    value > threshold && (values[index - 1] ?? 0) <= threshold ? [index] : [],
  );
}

export function assertTiming(actual: number[], expected: number[], tolerance: number): void {
  assert.equal(
    actual.length,
    expected.length,
    `Expected ${expected.length} pulses, got ${actual.join(', ')}`,
  );
  actual.forEach((time, index) => {
    assert(
      Math.abs(time - expected[index]!) <= tolerance,
      `Pulse ${index}: expected ${expected[index]}, got ${time}`,
    );
  });
}

export function checkSync(file: string): void {
  const marker = decode(file, [
    '-an',
    '-vf',
    'crop=32:32:0:0,scale=1:1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
  ]);
  assert.equal(marker.length, FRAME_COUNT);
  const visualFrames = starts([...marker], 127);
  assertTiming(
    visualFrames,
    PULSES.map((time) => time * FPS - FIRST_FRAME),
    0,
  );
  const pcm = decode(file, ['-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le']);
  const onsets = starts(rmsWindows(pcm), 0.1).map((index) => index / 1000);
  const expected = PULSES.map((time) => time - FIRST_FRAME / FPS);
  assertTiming(onsets, expected, 0.005);
  assertTiming(
    onsets,
    visualFrames.map((frame) => frame / FPS),
    0.005,
  );
  console.log(`  A/V pulses aligned within 5 ms: ${onsets.map((t) => t.toFixed(3)).join(', ')} s`);
}

function rmsWindows(pcm: Buffer): number[] {
  const window = SAMPLE_RATE / 1000;
  const count = Math.floor(pcm.length / 4 / window);
  return Array.from({ length: count }, (_, index) => {
    let sum = 0;
    for (let sample = 0; sample < window; sample++) {
      sum += pcm.readFloatLE((index * window + sample) * 4) ** 2;
    }
    return Math.sqrt(sum / window);
  });
}
