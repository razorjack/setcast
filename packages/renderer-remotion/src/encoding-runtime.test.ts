import { expect, test } from 'vite-plus/test';
import { encodingRuntime } from './encoding-runtime.ts';

test('streaming JPEG input reports the output encoder, not the input decoder', () => {
  expect(
    encodingRuntime(
      ['-f', 'image2pipe', '-vcodec', 'mjpeg', '-i', '-', '-c:v', 'libx264', 'out.mp4'],
      'pre-stitcher',
    ),
  ).toEqual({
    kind: 'encoder',
    encoder: 'libx264',
    inputFormat: 'image2pipe',
    pipeline: 'stream',
  });
});

test('shared-memory input remains distinguishable from compressed screenshots', () => {
  expect(
    encodingRuntime(
      ['-f', 'remotionshm', '-i', 'remotion', '-c:v', 'libx264', 'out.mp4'],
      'pre-stitcher',
    ),
  ).toMatchObject({
    encoder: 'libx264',
    inputFormat: 'remotionshm',
    pipeline: 'stream',
  });
});

test('image-sequence encoding supports aliases and omits stream-copy assembly', () => {
  expect(
    encodingRuntime(
      ['-f', 'image2', '-i', 'frame-%d.jpeg', '-codec:v', 'h264_videotoolbox', 'out.mp4'],
      'stitcher',
    ),
  ).toMatchObject({
    encoder: 'h264_videotoolbox',
    inputFormat: 'image2',
    pipeline: 'image-sequence',
  });
  expect(
    encodingRuntime(['-i', 'video.mp4', '-i', 'audio.m4a', '-c:v', 'copy', 'out.mp4'], 'stitcher'),
  ).toBeNull();
  expect(encodingRuntime(['-i', 'audio.wav', '-c:a', 'aac', 'out.m4a'], 'stitcher')).toBeNull();
});
