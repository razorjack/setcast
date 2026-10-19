import {
  HISTORY_SECONDS,
  soft,
  spectrumFeatures,
  waveSlice,
  WAVE_SECONDS,
  type AudioAnalyzer,
  type AudioFeatures,
} from './audio.ts';
import { FFT_SIZE, spectrum } from './spectrum.ts';

const ONSET_LOOKBACK = 0.06;
/** Fixed seconds, not a frame, so features are the same at 30 and 60 fps. */
const SMOOTH_LOOKBACK = 1 / 30;
const RMS_WINDOW = 1 / 30;
/** `HISTORY_SECONDS`, plus the analysis window and lookbacks `measure` adds to its oldest moment. */
const LOOKBACK_SECONDS = HISTORY_SECONDS + 0.2;

/** One decoded channel on the source's absolute timeline, in seconds. */
export interface PcmWindow {
  samples: Float32Array;
  sampleRate: number;
  offsetSeconds: number;
  durationSeconds: number;
}

/**
 * Whether `channel` holds the audio from `LOOKBACK_SECONDS` before `time` up to `time`, both
 * trimmed to the audio itself. A decoder must load both the history and FFT lookahead
 * before exposing this window to components that query earlier moments.
 */
export function coversPcmLookback(channel: PcmWindow, time: number) {
  const from = Math.max(0, time - LOOKBACK_SECONDS);
  const to = Math.min(time + FFT_SIZE / 2 / channel.sampleRate, channel.durationSeconds);
  const samples = channel.samples.length;
  const loadedTo = channel.offsetSeconds + samples / channel.sampleRate;
  const oneSample = 1 / channel.sampleRate;
  return channel.offsetSeconds <= from + oneSample && loadedTo >= to - oneSample;
}

/**
 * Measures stereo energy without phase cancellation; a mono channel can be shared by both sides.
 */
export function pcmAnalyzer(channels: { left: PcmWindow; right: PcmWindow }): AudioAnalyzer {
  const left = channels.left;
  const right = channels.right;
  const cache = new Map<number, AudioFeatures>();

  return {
    featuresAt(requested: number): AudioFeatures {
      const key = Math.round(withinWindow(left, requested) * left.sampleRate);
      const time = key / left.sampleRate;

      const cached = cache.get(key);
      if (cached) return cached;

      const features = measure(left, right, time);
      cache.set(key, features);
      return features;
    },
  };
}

/** The spectrum smoothed against the frame before it, loudness now and a moment ago, the waveform. */
function measure(left: PcmWindow, right: PcmWindow, time: number): AudioFeatures {
  const bands = once(() => {
    const current = stereoSpectrum(left, right, time);
    const previous = stereoSpectrum(left, right, withinWindow(left, time - SMOOTH_LOOKBACK));
    const magnitudes = current.map((magnitude, index) => 0.6 * magnitude + 0.4 * previous[index]!);
    return spectrumFeatures({ magnitudes, sampleRate: left.sampleRate });
  });
  const loudness = once(() => stereoLoudness(left, right, time));
  const onset = once(() => {
    const before = stereoLoudness(left, right, withinWindow(left, time - ONSET_LOOKBACK));
    return soft(Math.max(0, loudness() - before) * 4);
  });
  const wave = once(() => ({ left: waveAt(left, time), right: waveAt(right, time) }));
  return {
    get bass() {
      return bands().bass;
    },
    get mids() {
      return bands().mids;
    },
    get highs() {
      return bands().highs;
    },
    get bins() {
      return bands().bins;
    },
    get rms() {
      return loudness();
    },
    get onset() {
      return onset();
    },
    get wave() {
      return wave();
    },
  };
}

/**
 * Clamp only to unloaded audio. The real file boundaries are padded with silence by spectrum().
 */
function withinWindow(audioWindow: PcmWindow, time: number): number {
  const padding = FFT_SIZE / 2 / audioWindow.sampleRate;
  const firstTime = audioWindow.offsetSeconds === 0 ? 0 : audioWindow.offsetSeconds + padding;
  const loadedEnd = audioWindow.offsetSeconds + audioWindow.samples.length / audioWindow.sampleRate;
  const lastTime = loadedEnd >= audioWindow.durationSeconds ? loadedEnd : loadedEnd - padding;
  if (lastTime <= firstTime) return time;
  return Math.min(Math.max(time, firstTime), lastTime);
}

function powerAt(audioWindow: PcmWindow, time: number): number {
  const center = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const halfWindow = Math.floor((audioWindow.sampleRate * RMS_WINDOW) / 2);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(audioWindow.samples.length, center + halfWindow);
  if (end <= start) return 0;

  let sum = 0;
  for (let index = start; index < end; index++) sum += audioWindow.samples[index]! ** 2;
  return sum / (end - start);
}

function stereoLoudness(left: PcmWindow, right: PcmWindow, time: number): number {
  const power = (powerAt(left, time) + powerAt(right, time)) / 2;
  return soft(Math.sqrt(power), 3);
}

/** The `WAVE_SECONDS` of samples that end at `time`. */
function waveAt(audioWindow: PcmWindow, time: number): number[] {
  const end = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const start = end - Math.round(WAVE_SECONDS * audioWindow.sampleRate);
  return waveSlice(audioWindow.samples ?? [], start, end);
}

function spectrumAt(audioWindow: PcmWindow, time: number): number[] {
  const center = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  return spectrum(audioWindow.samples, center);
}

function stereoSpectrum(left: PcmWindow, right: PcmWindow, time: number): number[] {
  const magnitudes = spectrumAt(left, time);
  if (left === right) return magnitudes;
  const other = spectrumAt(right, time);
  return magnitudes.map((magnitude, index) => Math.hypot(magnitude, other[index]!) / Math.SQRT2);
}

/** Scopes need PCM, meters need energy, and spectra need FFTs; only compute what is read. */
function once<T>(measure: () => T): () => T {
  let value: T;
  let measured = false;
  return () => {
    if (!measured) {
      value = measure();
      measured = true;
    }
    return value;
  };
}
