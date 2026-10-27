import { FFT_SIZE, spectrum } from '../../packages/core/src/audio/spectrum.ts';
import { EVALUATION_RATE } from './constants.ts';

const WINDOW = 512;
const BANDS = 48;
const hann = Float32Array.from(
  { length: WINDOW },
  (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (WINDOW - 1)),
);
const bands = Array.from({ length: BANDS }, (_, index) => {
  const first = Math.floor((40 * (7000 / 40) ** (index / BANDS) * FFT_SIZE) / EVALUATION_RATE);
  const last = Math.floor((40 * (7000 / 40) ** ((index + 1) / BANDS) * FFT_SIZE) / EVALUATION_RATE);
  return { first, last: Math.max(first + 1, last) };
});

/** Bounded evaluation candidate: short Hann window, log bands and lagged maximum-filter flux. */
export class SpectralOnsets {
  private left = new Float32Array(WINDOW);
  private right = new Float32Array(WINDOW);
  private window = new Float32Array(FFT_SIZE);
  private position = 0;
  private history = [new Float64Array(BANDS), new Float64Array(BANDS)];

  push(left: number, right: number) {
    this.left[this.position] = left;
    this.right[this.position] = right;
    this.position = (this.position + 1) % WINDOW;
  }

  read(): number {
    const left = this.transform(this.left);
    const right = this.transform(this.right);
    const current = Float64Array.from(bands, ({ first, last }) => {
      let power = 0;
      for (let index = first; index < last; index++)
        power += (left[index]! ** 2 + right[index]! ** 2) / 2;
      return Math.log1p(100 * (FFT_SIZE / WINDOW) * Math.sqrt(power / (last - first)));
    });
    const previous = this.history.shift()!;
    this.history.push(current);
    let novelty = 0;
    for (let band = 0; band < BANDS; band++) {
      const before = Math.max(
        previous[band]!,
        previous[Math.max(0, band - 1)]!,
        previous[Math.min(BANDS - 1, band + 1)]!,
      );
      novelty += Math.max(0, current[band]! - before);
    }
    return novelty / Math.sqrt(BANDS);
  }

  private transform(samples: Float32Array) {
    for (let index = 0; index < WINDOW; index++) {
      this.window[(FFT_SIZE - WINDOW) / 2 + index] =
        samples[(this.position + index) % WINDOW]! * hann[index]!;
    }
    return spectrum(this.window, FFT_SIZE / 2);
  }
}
