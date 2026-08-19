// Writes examples/demo/assets/demo-set.wav (gitignored). Deterministic; takes ~2 s.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeDemo } from '../packages/cli/src/demo/synth.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '../examples/demo/assets/demo-set.wav');
const { wav, durationSeconds, sections } = synthesizeDemo();
await mkdir(dirname(out), { recursive: true });
await writeFile(out, wav);
console.log(`wrote ${out} (${durationSeconds.toFixed(1)} s, ${(wav.length / 1e6).toFixed(1)} MB)`);
for (const s of sections)
  console.log(`  ${s.name.padEnd(10)} ${s.startSeconds.toFixed(1).padStart(6)} s`);
