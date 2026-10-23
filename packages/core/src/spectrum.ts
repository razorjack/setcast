export const FFT_SIZE = 2048;

const reversed = Uint16Array.from({ length: FFT_SIZE }, (_, index) => {
  let reversedIndex = 0;
  for (let bit = 0; bit < 11; bit++) reversedIndex = (reversedIndex << 1) | ((index >> bit) & 1);
  return reversedIndex;
});

const rotations = rotationTable();

function rotationTable() {
  const table = new Map<number, { cosine: Float64Array; sine: Float64Array }>();
  for (let width = 2; width <= FFT_SIZE; width *= 2) {
    const cosine = new Float64Array(width / 2);
    const sine = new Float64Array(width / 2);
    for (let offset = 0; offset < width / 2; offset++) {
      const angle = (-2 * Math.PI * offset) / width;
      cosine[offset] = Math.cos(angle);
      sine[offset] = Math.sin(angle);
    }
    table.set(width, { cosine, sine });
  }
  return table;
}

/** Full-scale PCM is the reference, independent of the surrounding decoded windows. */
export function spectrum(samples: Float32Array, center: number): number[] {
  const real = new Float64Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index++) {
    real[index] = samples[center - FFT_SIZE / 2 + reversed[index]!] ?? 0;
  }
  const imaginary = new Float64Array(FFT_SIZE);
  for (let width = 2; width <= FFT_SIZE; width *= 2) transformPass(real, imaginary, width);
  const magnitudes = new Array<number>(FFT_SIZE / 2);
  for (let index = 0; index < magnitudes.length; index++) {
    magnitudes[index] = Math.hypot(real[index]!, imaginary[index]!) / (FFT_SIZE / 2);
  }
  return smoothSpectrum(magnitudes);
}

function transformPass(real: Float64Array, imaginary: Float64Array, width: number): void {
  const half = width / 2;
  const rotation = rotations.get(width)!;
  for (let offset = 0; offset < half; offset++) {
    const cosine = rotation.cosine[offset]!;
    const sine = rotation.sine[offset]!;
    for (let even = offset; even < FFT_SIZE; even += width) {
      const odd = even + half;
      const realOdd = real[odd]! * cosine - imaginary[odd]! * sine;
      const imaginaryOdd = real[odd]! * sine + imaginary[odd]! * cosine;
      real[odd] = real[even]! - realOdd;
      imaginary[odd] = imaginary[even]! - imaginaryOdd;
      real[even] = real[even]! + realOdd;
      imaginary[even] = imaginary[even]! + imaginaryOdd;
    }
  }
}

function smoothSpectrum(magnitudes: number[]): number[] {
  let previous = magnitudes;
  let next = new Array<number>(magnitudes.length);
  const last = magnitudes.length - 1;
  for (let pass = 0; pass < 3; pass++) {
    next[0] = previous[0]!;
    next[last] = previous[last]!;
    for (let index = 1; index < last; index++) {
      next[index] = (previous[index - 1]! + previous[index]! + previous[index + 1]!) / 3;
    }
    const swap = previous;
    previous = next;
    next = swap;
  }
  return previous;
}
