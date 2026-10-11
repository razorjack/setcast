import {
  HISTORY_SECONDS,
  soft,
  spectrumFeatures,
  waveSlice,
  WAVE_SECONDS,
  type AudioAnalyzer,
  type AudioFeatures,
} from '@setcast/core';
import type { MediaUtilsAudioData } from '@remotion/media-utils';
import { FFT_SIZE, spectrum } from './spectrum.ts';

const ONSET_LOOKBACK = 0.06;
/** Fixed seconds, not a frame, so features are the same at 30 and 60 fps. */
const SMOOTH_LOOKBACK = 1 / 30;
const RMS_WINDOW = 1 / 30;
/** `HISTORY_SECONDS`, plus the analysis window and lookbacks `measure` adds to its oldest moment. */
const LOOKBACK_SECONDS = HISTORY_SECONDS + 0.2;

/** One channel as `useWindowedAudioData` returns it: the loaded windows and where they start. */
export interface ChannelWindow {
  audioData: MediaUtilsAudioData;
  dataOffsetInSeconds: number;
}

interface AudioWindow {
  audioData: MediaUtilsAudioData;
  offsetSeconds: number;
  samples: Float32Array;
  sampleRate: number;
}

const windowOf = ({ audioData, dataOffsetInSeconds }: ChannelWindow): AudioWindow => ({
  audioData,
  offsetSeconds: dataOffsetInSeconds,
  samples: audioData.channelWaveforms[0] ?? new Float32Array(),
  sampleRate: audioData.sampleRate,
});

/**
 * Whether `channel` holds the audio from `LOOKBACK_SECONDS` before `time` up to `time`, both
 * trimmed to the audio itself. `useWindowedAudioData` loads the window before the current one
 * after the current one, so without this check the first frames of a render could look back into
 * audio that is not there yet, and render differently from run to run.
 */
export function coversLookback({ audioData, dataOffsetInSeconds }: ChannelWindow, time: number) {
  const from = Math.max(0, time - LOOKBACK_SECONDS);
  const to = Math.min(time + FFT_SIZE / 2 / audioData.sampleRate, audioData.durationInSeconds);
  const samples = audioData.channelWaveforms[0]?.length ?? 0;
  const loadedTo = dataOffsetInSeconds + samples / audioData.sampleRate;
  const oneSample = 1 / audioData.sampleRate;
  return dataOffsetInSeconds <= from + oneSample && loadedTo >= to - oneSample;
}

/**
 * Measures stereo energy without phase cancellation; a mono channel can be shared by both sides.
 */
export function windowedAnalyzer(
  channels: { left: ChannelWindow; right: ChannelWindow },
  _fps: number,
): AudioAnalyzer {
  const left = windowOf(channels.left);
  const right = channels.right === channels.left ? left : windowOf(channels.right);
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
function measure(left: AudioWindow, right: AudioWindow, time: number): AudioFeatures {
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
function withinWindow(audioWindow: AudioWindow, time: number): number {
  const padding = FFT_SIZE / 2 / audioWindow.sampleRate;
  const firstTime = audioWindow.offsetSeconds === 0 ? 0 : audioWindow.offsetSeconds + padding;
  const loadedEnd = audioWindow.offsetSeconds + audioWindow.samples.length / audioWindow.sampleRate;
  const lastTime =
    loadedEnd >= audioWindow.audioData.durationInSeconds ? loadedEnd : loadedEnd - padding;
  if (lastTime <= firstTime) return time;
  return Math.min(Math.max(time, firstTime), lastTime);
}

function powerAt(audioWindow: AudioWindow, time: number): number {
  const center = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const halfWindow = Math.floor((audioWindow.sampleRate * RMS_WINDOW) / 2);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(audioWindow.samples.length, center + halfWindow);
  if (end <= start) return 0;

  let sum = 0;
  for (let index = start; index < end; index++) sum += audioWindow.samples[index]! ** 2;
  return sum / (end - start);
}

function stereoLoudness(left: AudioWindow, right: AudioWindow, time: number): number {
  const power = (powerAt(left, time) + powerAt(right, time)) / 2;
  return soft(Math.sqrt(power), 3);
}

/** The `WAVE_SECONDS` of samples that end at `time`. */
function waveAt(audioWindow: AudioWindow, time: number): number[] {
  const end = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const start = end - Math.round(WAVE_SECONDS * audioWindow.sampleRate);
  return waveSlice(audioWindow.samples ?? [], start, end);
}

function spectrumAt(audioWindow: AudioWindow, time: number): number[] {
  const center = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  return spectrum(audioWindow.samples, center);
}

function stereoSpectrum(left: AudioWindow, right: AudioWindow, time: number): number[] {
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
