import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RenderInternals } from '@remotion/renderer';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';
import { encodeMasterAudio, muxChunks } from './mux.ts';

let dir: string;
const fps = 30;
const ranges: [number, number][] = [
  [1, 30],
  [31, 32],
];

function ffmpeg(args: string[]) {
  return RenderInternals.callFf({
    bin: 'ffmpeg',
    args: ['-v', 'error', '-y', ...args],
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "setcast-mux-'test-"));
  const image = join(dir, 'frame.png');
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJ0lEQVR4nO3NMQ0AAAwDoEqtfxVVsWMJGCA9FoFAIBAIBAKBQPAlGKVngD34HFgMAAAAAElFTkSuQmCC';
  await writeFile(image, Buffer.from(png, 'base64'));
  for (const [index, [first, last]] of ranges.entries()) {
    await ffmpeg([
      '-loop',
      '1',
      '-framerate',
      String(fps),
      '-i',
      image,
      '-frames:v',
      String(last - first + 1),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-video_track_timescale',
      '90000',
      join(dir, `chunk-${index}.mp4`),
    ]);
  }
  // The source ends just before the final video frame ends, exercising silent tail padding.
  const samples = Buffer.alloc(48000 * 2 * 1.09);
  for (let i = 0; i < samples.length / 2; i++)
    samples.writeInt16LE(Math.round(8000 * Math.sin(i * i * 0.00001)), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(samples.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);
  await writeFile(join(dir, "master's audio.wav"), Buffer.concat([header, samples]));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test.each(['mp4', 'mov', 'mkv'])(
  'joins video without re-encoding and creates one continuous soundtrack in %s',
  async (extension) => {
    const output = join(dir, `out.${extension}`);
    const duration = 32 / fps;
    const progress: number[] = [];
    const master = join(dir, 'encoded-master.mp4');
    await encodeMasterAudio({
      audio: join(dir, "master's audio.wav"),
      output: master,
      start: 1 / fps,
      duration,
    });
    await muxChunks({
      dir,
      ranges,
      fps,
      audio: master,
      output,
      onProgress: (value) => {
        progress.push(value);
      },
    });
    const probe = await RenderInternals.callFf({
      bin: 'ffprobe',
      args: ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', output],
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
      cancelSignal: undefined,
    });
    const { streams } = JSON.parse(probe.stdout);
    expect(streams.map((stream: { codec_name: string }) => stream.codec_name)).toEqual([
      'h264',
      'aac',
    ]);
    expect(streams[0].nb_read_frames).toBe('32');
    expect(streams[1]).toMatchObject({ sample_rate: '48000', channels: 2 });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((value) => value >= 0 && value < 1)).toBe(true);
    if (extension === 'mkv') return;
    expect(Number(streams[0].duration)).toBeCloseTo(duration, 5);
    expect(Number(streams[1].duration)).toBeCloseTo(duration, 5);
    // Compare against a single encode of the exact source range, including AAC priming removal.
    const reference = join(dir, 'reference.mp4');
    await ffmpeg([
      '-ss',
      String(1 / fps),
      '-i',
      join(dir, "master's audio.wav"),
      '-t',
      String(duration),
      '-ac',
      '2',
      '-ar',
      '48000',
      '-af',
      'apad',
      '-c:a',
      'aac',
      '-b:a',
      '320k',
      '-movie_timescale',
      '90000',
      reference,
    ]);
    for (const [name, file] of [
      ['actual', output],
      ['reference', reference],
    ]) {
      await ffmpeg([
        '-i',
        file!,
        '-vn',
        '-t',
        String(duration),
        '-c:a',
        'pcm_s16le',
        join(dir, `${name}.wav`),
      ]);
    }
    const actual = await readPcm(join(dir, 'actual.wav'));
    expect(actual.length).toBe(Math.round(duration * 48000) * 2 * 2);
    expect(actual.equals(await readPcm(join(dir, 'reference.wav')))).toBe(true);
  },
);

async function readPcm(file: string) {
  const wav = await readFile(file);
  for (let offset = 12; offset + 8 <= wav.length;) {
    const length = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data')
      return wav.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  throw new Error(`Missing WAV data in ${file}`);
}

test('reports FFmpeg failures with the original cause and diagnostic', async () => {
  await expect(
    muxChunks({
      dir,
      ranges,
      fps,
      audio: join(dir, 'missing.wav'),
      output: join(dir, 'out.mp4'),
      onProgress: () => {},
    }),
  ).rejects.toMatchObject({
    message: expect.stringContaining('Cannot assemble rendered chunks'),
    hint: expect.stringContaining('missing.wav'),
    exitCode: 1,
    cause: expect.any(Error),
  });
});
