/** Windowed-sinc resampling with bounded input history and cached fractional-phase filters. */
export class Resampler {
  private readonly ratio: number;
  private readonly radius: number;
  private readonly length: number;
  private readonly kernels = new Map<number, Float64Array>();
  private buffered = new Float32Array();
  private base = 0;
  private written = 0;

  constructor(frames: number, fromRate: number, toRate: number) {
    this.ratio = fromRate / toRate;
    this.radius = Math.ceil(16 * Math.max(1, this.ratio));
    this.length = Math.floor(frames / this.ratio);
  }

  push(chunk: Float32Array): Float32Array {
    if (this.ratio === 1) return chunk;
    const joined = new Float32Array(this.buffered.length + chunk.length);
    joined.set(this.buffered);
    joined.set(chunk, this.buffered.length);
    this.buffered = joined;
    const available = Math.ceil((this.base + joined.length - this.radius) / this.ratio);
    return this.read(Math.max(0, Math.min(this.length, available) - this.written));
  }

  done(): Float32Array {
    return this.ratio === 1 ? new Float32Array() : this.read(this.length - this.written);
  }

  private read(count: number): Float32Array {
    const out = new Float32Array(count);
    for (let index = 0; index < count; index++, this.written++) {
      const position = this.written * this.ratio;
      const center = Math.floor(position);
      const weights = this.kernel(position - center);
      let value = 0;
      for (let tap = 0; tap < weights.length; tap++) {
        const source = center - this.radius + 1 + tap - this.base;
        const clamped = Math.max(0, Math.min(this.buffered.length - 1, source));
        value += (this.buffered[clamped] ?? 0) * weights[tap]!;
      }
      out[index] = value;
    }
    const discard = Math.max(
      0,
      Math.min(
        this.buffered.length - 1,
        Math.floor(this.written * this.ratio) - this.radius + 1 - this.base,
      ),
    );
    this.buffered = this.buffered.slice(discard);
    this.base += discard;
    return out;
  }

  private kernel(fraction: number): Float64Array {
    const phase = Math.round(fraction * 1024);
    const cached = this.kernels.get(phase);
    if (cached) return cached;
    const cutoff = 0.45 / Math.max(1, this.ratio);
    const weights = Float64Array.from({ length: 2 * this.radius }, (_, index) => {
      const distance = index - this.radius + 1 - phase / 1024;
      const sinc =
        distance === 0
          ? 2 * cutoff
          : Math.sin(2 * Math.PI * cutoff * distance) / (Math.PI * distance);
      const window =
        0.42 +
        0.5 * Math.cos((Math.PI * distance) / this.radius) +
        0.08 * Math.cos((2 * Math.PI * distance) / this.radius);
      return sinc * window;
    });
    const sum = weights.reduce((total, weight) => total + weight, 0);
    for (let index = 0; index < weights.length; index++) weights[index] = weights[index]! / sum;
    this.kernels.set(phase, weights);
    return weights;
  }
}
