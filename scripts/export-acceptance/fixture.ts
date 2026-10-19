import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadProject, probeAudio, readWholeSet } from '../../packages/core/src/node/index.ts';
import { themes } from '../../packages/themes/src/index.ts';

export const FPS = 30;
export const SAMPLE_RATE = 48000;
export const DURATION = 3.1415;
export const PULSES = [1.5, 2.5];
export const FIRST_FRAME = 32;
export const FRAME_COUNT = 63;

export const art = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <defs><linearGradient id="g"><stop stop-color="#092736"/><stop offset="1" stop-color="#d5aa68"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/><circle cx="420" cy="140" r="88" fill="#e1e7d5"/>
  <path d="M0 290L170 130L340 340L640 220V360H0Z" fill="#102733"/>
</svg>`);

const markerCss = `
.setcast { background: black; }
.setcast > :not(style) { display: none; }
.setcast::after { content: ''; position: absolute; left: 0; top: 0; width: 32px; height: 32px;
  background: white; opacity: var(--mod-pulse); }
`;

export async function createFixture(dir: string): Promise<void> {
  await writeFile(join(dir, 'tone.wav'), wav());
  await writeFile(join(dir, 'art.svg'), art);
  await writeFile(join(dir, 'marker.css'), markerCss);
  await writeFile(
    join(dir, 'setcast.yaml'),
    `
title: Export acceptance
audio: tone.wav
background: art.svg
theme: ./marker.css
output: { width: 640, height: 360, fps: ${FPS} }
plays:
  - { at: 0, until: 2, title: First, artist: Fixture }
  - { at: 1.5, title: Second, artist: Fixture }
annotations:
  - { kind: drop, at: 1.5 }
  - { kind: drop, at: 2.5 }
modulation:
  - { source: since:drop, target: pulse, window: 0.1 }
`,
  );
}

export async function fixtureProject(dir: string, theme?: string) {
  const { project } = await loadProject(dir, {
    themes,
    theme,
    probeDuration: (audio, root) => probeAudio({ audio }, root),
  });
  return { ...project, ...(await readWholeSet(project, dir)) };
}

function wav(): Buffer {
  const samples = Math.round(DURATION * SAMPLE_RATE);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(SAMPLE_RATE, 24);
  bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / SAMPLE_RATE;
    if (PULSES.some((at) => time >= at && time < at + 0.1)) {
      bytes.writeInt16LE(Math.round(20000 * Math.sin(2 * Math.PI * 1000 * time)), 44 + index * 2);
    }
  }
  return bytes;
}
