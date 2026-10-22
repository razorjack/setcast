import {
  FFT_SIZE,
  HISTORY_SECONDS,
  SILENCE,
  pcmAnalyzer,
  type AudioAnalyzer,
  type AudioFeatures,
  type PcmWindow,
} from '@setcast/core';

const RETAIN_SECONDS = HISTORY_SECONDS + 3;
const CACHE_LIMIT = 2048;

/** Bounded stereo PCM history. Absolute sample positions preserve time across dropped packets. */
export class LiveAudio implements AudioAnalyzer {
  readonly sampleRate: number;
  readonly capacity: number;
  private readonly left: Float32Array;
  private readonly right: Float32Array;
  private readonly cache = new Map<number, AudioFeatures>();
  private end = 0;
  private first = 0;

  constructor(sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) {
      throw new RangeError(`LiveAudio received sampleRate=${sampleRate}; use 8000 to 384000 Hz.`);
    }
    this.sampleRate = sampleRate;
    this.capacity = Math.ceil(sampleRate * RETAIN_SECONDS);
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
  }

  get time(): number {
    return Math.max(0, (this.end - FFT_SIZE / 2 - 1) / this.sampleRate);
  }

  get capturedTime(): number {
    return this.end / this.sampleRate;
  }

  get cachedMoments(): number {
    return this.cache.size;
  }

  clear() {
    this.left.fill(0);
    this.right.fill(0);
    this.cache.clear();
    this.first = this.end;
  }

  append(start: number, left: Float32Array, right: Float32Array) {
    if (!Number.isSafeInteger(start) || start < this.end || left.length !== right.length) {
      throw new RangeError(
        'LiveAudio.append requires ordered, nonoverlapping stereo packets of equal length.',
      );
    }
    const end = start + left.length;
    const from = Math.max(this.end, end - this.capacity);
    for (let sample = from; sample < end; sample++) {
      const index = sample % this.capacity;
      this.left[index] = left[sample - start] ?? 0;
      this.right[index] = right[sample - start] ?? 0;
    }
    this.end = end;
    this.first = Math.max(this.first, end - this.capacity);
    for (const sample of this.cache.keys()) {
      if (sample < this.first) this.cache.delete(sample);
    }
  }

  featuresAt(time: number): AudioFeatures {
    if (!Number.isFinite(time) || time < 0 || time > this.time) return SILENCE;
    const sample = Math.round(time * this.sampleRate);
    if (sample < this.first) return SILENCE;
    const cached = this.cache.get(sample);
    if (cached) return cached;
    const left = this.window(this.left, sample);
    const right = this.window(this.right, sample);
    // Materialize before the scratch windows are released; cached features never retain PCM.
    const features = { ...pcmAnalyzer({ left, right }).featuresAt(sample / this.sampleRate) };
    this.cache.set(sample, features);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return features;
  }

  /** Cheap fixed-hop energy for live tempo analysis, without allocating FFT windows. */
  energyAt(time: number): number {
    const end = Math.round(time * this.sampleRate);
    const start = end - Math.round(this.sampleRate / 100);
    if (!Number.isFinite(time) || start < this.first || end > this.end) return 0;
    let sum = 0;
    for (let sample = start; sample < end; sample++) {
      const index = sample % this.capacity;
      sum += (this.left[index]! ** 2 + this.right[index]! ** 2) / 2;
    }
    return Math.sqrt(sum / (end - start));
  }

  private window(channel: Float32Array, sample: number): PcmWindow {
    const from = Math.max(0, sample - Math.ceil(this.sampleRate * 0.2));
    const to = sample + FFT_SIZE / 2 + 1;
    const samples = new Float32Array(to - from);
    for (let index = 0; index < samples.length; index++) {
      const position = from + index;
      if (position >= this.first && position < this.end) {
        samples[index] = channel[position % this.capacity]!;
      }
    }
    return {
      samples,
      sampleRate: this.sampleRate,
      offsetSeconds: from / this.sampleRate,
      durationSeconds: this.end / this.sampleRate,
    };
  }
}

export function inputChannels(channels: [number, number] | null, count: number): [number, number] {
  const selected: [number, number] = channels ?? [1, Math.min(2, count)];
  if (
    count < 1 ||
    selected.some((channel) => !Number.isInteger(channel) || channel < 1 || channel > count)
  ) {
    throw new Error(
      `Input channels ${selected.join(' / ')} are unavailable: the browser exposes ${count} channel(s). Choose channels from 1 to ${count}, or route the mixer to a stereo input in your interface software.`,
    );
  }
  return selected;
}
