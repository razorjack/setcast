import { BEAT_WINDOW_HOPS, validBeatRange, type BeatRange } from './beat.ts';

export interface BeatEstimate {
  bpm: number;
  beatOffset: number;
  confidence: number;
  ambiguous: boolean;
  periodicity: number;
  phaseStrength: number;
  margin: number;
  competitorBpm: number | null;
}

/** Scores are periodicity heuristics, not calibrated probabilities of musical correctness. */
export function estimateBeat(
  onsets: readonly number[],
  start: number,
  range: BeatRange,
): BeatEstimate {
  validateWindow(onsets, start, range);
  const accents = prominentOnsets(onsets);
  const candidates = [];
  for (let bpm = range.min; bpm <= range.max; bpm += 0.2) {
    const period = 6000 / bpm;
    const score = correlation(accents, period);
    candidates.push({ bpm, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const competitor = candidates.find((item) => Math.abs(item.bpm / best.bpm - 1) > 0.06);
  const phase = beatPhase(accents, 6000 / best.bpm);
  return {
    bpm: Math.round(best.bpm * 10) / 10,
    beatOffset: start + phase.offset / 100,
    confidence: Math.max(0, Math.min(best.score, phase.strength)),
    ambiguous: Boolean(competitor && best.score - competitor.score < 0.08),
    periodicity: best.score,
    phaseStrength: phase.strength,
    margin: competitor ? best.score - competitor.score : best.score,
    competitorBpm: competitor ? Math.round(competitor.bpm * 10) / 10 : null,
  };
}

function prominentOnsets(values: readonly number[]) {
  const accents = values.map((value, index) => {
    const local = values.slice(Math.max(0, index - 25), index + 26);
    const average = local.reduce((sum, entry) => sum + entry, 0) / local.length;
    return Math.max(0, value - average) ** 2;
  });
  return accents.map(
    (value, index) => value + 0.5 * ((accents[index - 1] ?? 0) + (accents[index + 1] ?? 0)),
  );
}

function correlation(values: number[], lag: number) {
  let product = 0;
  let left = 0;
  let right = 0;
  for (let index = Math.ceil(lag); index < values.length; index++) {
    const position = index - lag;
    const floor = Math.floor(position);
    const fraction = position - floor;
    const a = values[index]!;
    const b = values[floor]! * (1 - fraction) + values[floor + 1]! * fraction;
    product += a * b;
    left += a * a;
    right += b * b;
  }
  return product / Math.max(1e-12, Math.sqrt(left * right));
}

function beatPhase(values: number[], period: number) {
  let x = 0;
  let y = 0;
  let total = 0;
  for (let index = 0; index < values.length; index++) {
    const angle = (2 * Math.PI * index) / period;
    x += values[index]! * Math.cos(angle);
    y += values[index]! * Math.sin(angle);
    total += values[index]!;
  }
  const offset = (((Math.atan2(y, x) / (2 * Math.PI)) % 1) + 1) % 1;
  return { offset: offset * period, strength: Math.hypot(x, y) / Math.max(1e-12, total) };
}

function validateWindow(onsets: readonly number[], start: number, range: BeatRange) {
  if (!validBeatRange(range)) throw new RangeError('Choose 40–240 BPM, at least 10 BPM apart.');
  if (!Number.isFinite(start) || start < 0)
    throw new RangeError('estimateBeat requires finite, nonnegative absolute start seconds.');
  if (
    onsets.length !== BEAT_WINDOW_HOPS ||
    onsets.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new RangeError(
      'estimateBeat requires exactly 800 finite, nonnegative onset values at 100 Hz.',
    );
}
