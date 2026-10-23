import type { Method } from './config.ts';

export const EVALUATION_RATE = 16000;
const HOP_SAMPLES = EVALUATION_RATE / 100;
const LOW = 1 - Math.exp((-2 * Math.PI * 150) / EVALUATION_RATE);
const HIGH = 1 - Math.exp((-2 * Math.PI * 2000) / EVALUATION_RATE);

/** Evaluation candidates only. Separate channel powers avoid antiphase cancellation. */
export class OnsetComparison {
  private filters = [new Float64Array(4), new Float64Array(4)];
  private powers = new Float64Array(4);
  private previous = new Float64Array(4);
  private samples = 0;
  private hop: number;

  constructor(at = 0) {
    this.hop = Math.round(at * 100);
  }

  push(left: number, right: number): { hop: number; values: Record<Method, number> } | null {
    if (!Number.isFinite(left) || !Number.isFinite(right))
      throw new Error('Decoded PCM contains a non-finite sample.');
    this.channel(left, this.filters[0]!);
    this.channel(right, this.filters[1]!);
    if (++this.samples < HOP_SAMPLES) return null;
    this.samples = 0;
    const novelty = this.powers.map((power, band) => {
      const level = Math.log1p(100 * Math.sqrt(power / (2 * HOP_SAMPLES)));
      const rise = Math.max(0, level - this.previous[band]!);
      this.previous[band] = level;
      return rise;
    });
    this.powers.fill(0);
    return {
      hop: ++this.hop,
      values: {
        energy: novelty[0]!,
        bands: (novelty[1]! + novelty[2]! + novelty[3]!) / 3,
        bass: novelty[1]!,
      },
    };
  }

  private channel(sample: number, state: Float64Array) {
    state[0] = state[0]! + LOW * (sample - state[0]!);
    state[1] = state[1]! + LOW * (state[0]! - state[1]!);
    state[2] = state[2]! + HIGH * (sample - state[2]!);
    state[3] = state[3]! + HIGH * (state[2]! - state[3]!);
    this.powers[0] = this.powers[0]! + sample * sample;
    this.powers[1] = this.powers[1]! + state[1]! ** 2;
    this.powers[2] = this.powers[2]! + (state[3]! - state[1]!) ** 2;
    this.powers[3] = this.powers[3]! + (sample - state[3]!) ** 2;
  }
}
