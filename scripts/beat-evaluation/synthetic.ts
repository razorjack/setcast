import type { EvaluationCase } from './config.ts';
import { EVALUATION_RATE } from './onsets.ts';

type SyntheticSource = Exclude<EvaluationCase['source'], { file: string }>;

/** Synthetic labels describe the authored grid, including deliberately misleading offbeats. */
export function syntheticSample(source: SyntheticSource, sample: number): number {
  const time = sample / EVALUATION_RATE;
  const noise = random(sample, source.seed);
  if (source.pattern === 'silence') return 0;
  if (source.pattern === 'noise') return noise * 0.25;
  if (source.pattern === 'tone') return Math.sin(time * Math.PI * 2 * 220) * 0.3;
  const { bpm, offset } = gridAt(source, time);
  const period = 60 / bpm;
  const beat = (time - offset) / period;
  if (beat < 0) return 0;
  if (source.pattern === 'breaks') return breaks(beat, period, noise);
  const kick = drum(remainder(beat, 1) * period, 70, 0.06) * 0.65;
  if (source.pattern === 'missing-beats') return Math.floor(beat) % 7 === 6 ? 0 : kick;
  if (['pulse', 'tempo-change', 'tempo-continuous', 'phase-step'].includes(source.pattern))
    return kick;
  const hatTime = remainder(beat - 0.5, 1) * period;
  const hat = noise * decay(hatTime, 0.025);
  if (source.pattern === 'offbeat') return kick * 0.08 + hat * 0.9;
  const snare = noise * decay(remainder(beat - 1, 2) * period, 0.08) * 0.4;
  const bass = Math.sin(time * Math.PI * 2 * 55) * 0.15;
  return Math.max(-1, Math.min(1, kick + snare + hat * 0.25 + bass));
}

function gridAt(source: SyntheticSource, time: number) {
  if (time < 16) return { bpm: source.bpm, offset: source.offset };
  if (source.pattern === 'phase-step')
    return { bpm: source.bpm, offset: source.offset + 15 / source.bpm };
  if (!source.pattern.startsWith('tempo-')) return { bpm: source.bpm, offset: source.offset };
  const bpm = source.bpm + 20;
  const offset =
    source.pattern === 'tempo-continuous'
      ? 16 - ((16 - source.offset) * source.bpm) / bpm
      : source.offset;
  return { bpm, offset };
}

function breaks(beat: number, period: number, noise: number) {
  const kickTime = Math.min(remainder(beat, 4), remainder(beat - 2.5, 4)) * period;
  const snareTime = remainder(beat - 1, 2) * period;
  const ghostTime = remainder(beat - 1.75, 2) * period;
  const kick = drum(kickTime, 65, 0.08) * 0.6;
  const snare = noise * (decay(snareTime, 0.09) * 0.6 + decay(ghostTime, 0.04) * 0.12);
  const hat = noise * decay(remainder(beat, 0.5) * period, 0.02) * 0.12;
  return Math.max(-1, Math.min(1, kick + snare + hat));
}

function drum(time: number, frequency: number, seconds: number) {
  return Math.sin(time * Math.PI * 2 * frequency) * decay(time, seconds);
}

function decay(time: number, seconds: number) {
  return time < seconds ? Math.exp((-time * 5) / seconds) : 0;
}
function remainder(value: number, period: number) {
  return ((value % period) + period) % period;
}
function random(sample: number, seed: number) {
  let value = (sample ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x80000000 - 1;
}
