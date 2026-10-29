import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RendererFeature } from '../diagnostics/renderer-capabilities.ts';
import { RendererDiagnostics, type DiagnosticCommand } from './renderer-diagnostics.ts';

const videoFeatures: RendererFeature[] = ['video', 'resume', 'cache'];
const quiet = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];

export async function diagnoseCodecs(session: RendererDiagnostics, command: DiagnosticCommand) {
  const supported = (features: RendererFeature[]) =>
    features.filter((feature) => session.capabilities.features.includes(feature));
  const features = supported(videoFeatures);
  const system = session.capabilities.runtime.ffmpeg === 'system';
  const inspectionFeatures = supported(
    system ? ['resume', 'cache'] : ['video', 'hardwareEncoding'],
  );
  const hint = system
    ? 'Install FFmpeg on PATH with libx264 and AAC encoding support.'
    : 'Reinstall the selected Setcast/Remotion packages for this operating system and architecture.';
  const ffmpeg = await session.check(
    'ffmpeg',
    supported([...features, 'hardwareEncoding']),
    hint,
    async () => ({ message: (await command('ffmpeg', ['-version'])).split('\n')[0]! }),
  );
  const ffprobe = await session.check(
    'ffprobe',
    inspectionFeatures,
    system
      ? 'Install ffprobe on PATH (normally supplied with FFmpeg). It is required for resume and persistent cache.'
      : hint,
    async () => ({ message: (await command('ffprobe', ['-version'])).split('\n')[0]! }),
  );
  if (!ffmpeg) {
    session.skip('video.encode', features, 'FFmpeg is unavailable.');
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), 'setcast-doctor-'));
  try {
    await writeFixtures(directory);
    const video = await session.check('video.encode', features, hint, async () => {
      for (const container of session.capabilities.videoContainers)
        await encodeFixture(command, directory, join(directory, `probe.${container}`));
      return { message: 'Encoded H.264 + AAC in MP4, MOV and MKV.' };
    });
    if (video && ffprobe)
      await checkMedia(session, command, join(directory, 'probe.mp4'), inspectionFeatures);
    else
      session.skip(
        'video.inspect',
        inspectionFeatures,
        'Encoded fixture or ffprobe is unavailable.',
      );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Three 64x64 JPEG frames and a short PCM WAV exercise the same inputs as export without
// depending on optional lavfi sources or rawvideo demuxers in a minimal FFmpeg build.
async function writeFixtures(directory: string) {
  const image = Buffer.from(
    '/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjEuMTAyAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAEoAAQAAAAAAAAAAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAAQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCABAAEADASIAAhEAAxEA/9oADAMBAAIRAxEAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==',
    'base64',
  );
  const audio = Buffer.alloc(44 + 4800 * 4);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(2, 22);
  audio.writeUInt32LE(48000, 24);
  audio.writeUInt32LE(48000 * 4, 28);
  audio.writeUInt16LE(4, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  for (let sample = 0; sample < 4800; sample++) {
    const value = Math.round(Math.sin((sample * 2 * Math.PI * 440) / 48000) * 8192);
    audio.writeInt16LE(value, 44 + sample * 4);
    audio.writeInt16LE(value, 44 + sample * 4 + 2);
  }
  await writeFile(join(directory, 'frames.jpg'), Buffer.concat([image, image, image]));
  await writeFile(join(directory, 'audio.wav'), audio);
}

function videoInput(directory: string) {
  return [
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    '-framerate',
    '30',
    '-i',
    join(directory, 'frames.jpg'),
  ];
}

async function encodeFixture(command: DiagnosticCommand, directory: string, file: string) {
  await command('ffmpeg', [
    ...quiet,
    ...videoInput(directory),
    '-i',
    join(directory, 'audio.wav'),
    '-t',
    '0.1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    file,
  ]);
  if ((await stat(file)).size === 0) throw new Error('Encoder produced an empty fixture.');
  await command('ffmpeg', [
    ...quiet,
    '-i',
    file,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-f',
    'null',
    '-',
  ]);
}

async function checkMedia(
  session: RendererDiagnostics,
  command: DiagnosticCommand,
  file: string,
  features: RendererFeature[],
) {
  await session.check(
    'video.inspect',
    features,
    'Check that ffprobe and FFmpeg support the encoded H.264/AAC fixture.',
    async () => {
      const result = JSON.parse(
        await command('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,codec_type,width,height,nb_frames',
          '-of',
          'json',
          file,
        ]),
      );
      const video = result.streams?.find(
        (stream: { codec_type: string }) => stream.codec_type === 'video',
      );
      const audio = result.streams?.find(
        (stream: { codec_type: string }) => stream.codec_type === 'audio',
      );
      if (
        video?.codec_name !== 'h264' ||
        audio?.codec_name !== 'aac' ||
        video.width !== 64 ||
        video.height !== 64 ||
        Number(video.nb_frames) !== 3
      )
        throw new Error(
          'Encoded fixture does not contain the expected 3 H.264 frames and AAC audio.',
        );
      return { message: 'ffprobe verified fixture codecs, dimensions and frame count.' };
    },
  );
}
