import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pixels } from './measure.ts';
import type { AcceptanceContext } from './readiness.ts';

export async function checkVideo(context: AcceptanceContext): Promise<void> {
  const { exporter, project, projectDir, out } = context;
  createVideo(join(projectDir, 'loop.mp4'));
  const video = {
    ...project,
    background: 'loop.mp4',
    visualizers: [],
    css: `
body { margin: 0; }
.setcast { position: relative; overflow: hidden; background: black; }
.setcast > :not(style):not(.sc-bg) { display: none; }
.sc-bg { position: absolute; inset: 0; }
.sc-bg-img { width: 100%; height: 100%; }
.sc-art, .sc-bg-vignette { display: none; }
`,
  };
  const frames: Buffer[] = [];
  for (const at of [1.25, 0.75, 0.25]) {
    const file = join(out, `video-${at}.png`);
    await exporter.still(video, { projectDir, out: file, at });
    frames.push(pixels(file));
  }
  assert(
    frames[0]!.equals(frames[2]!),
    'Video loop must repeat the same frame after a backward seek',
  );
  assert(frames[0]![0]! > 240 && frames[0]![2]! < 10, 'Expected the red half of the video');
  assert(frames[1]![2]! > 240 && frames[1]![0]! < 10, 'Expected the blue half of the video');
  console.log('  video background seeks and loops at the requested frame');
}

export function createVideo(file: string): void {
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=640x360:r=30:d=0.5',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=640x360:r=30:d=0.5',
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
}
