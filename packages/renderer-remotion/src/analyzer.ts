import {
  rms,
  soft,
  spectrumFeatures,
  waveSlice,
  WAVE_SECONDS,
  type AudioAnalyzer,
  type AudioFeatures,
} from '@setcast/core';
import { visualizeAudio, type MediaUtilsAudioData } from '@remotion/media-utils';

const SAMPLES = 1024;
const ONSET_LOOKBACK = 0.06;
/** Fixed seconds, not a frame, so features are the same at 30 and 60 fps. */
const SMOOTH_LOOKBACK = 1 / 30;
const RMS_WINDOW = 1 / 30;

/** One channel as `useWindowedAudioData` returns it: the loaded windows and where they start. */
export interface ChannelWindow {
  audioData: MediaUtilsAudioData;
  dataOffsetInSeconds: number;
}

interface AudioWindow {
  audioData: MediaUtilsAudioData;
  offsetSeconds: number;
  fps: number;
  samples: Float32Array | undefined;
  sampleRate: number;
}

const windowOf = ({ audioData, dataOffsetInSeconds }: ChannelWindow, fps: number): AudioWindow => ({
  audioData,
  offsetSeconds: dataOffsetInSeconds,
  fps,
  samples: audioData.channelWaveforms[0],
  sampleRate: audioData.sampleRate,
});

/**
 * Turns Remotion's windowed audio data into Setcast's `AudioAnalyzer`. The spectrum and loudness
 * read the left channel; the waveform reads both.
 */
export function windowedAnalyzer(
  channels: { left: ChannelWindow; right: ChannelWindow },
  fps: number,
): AudioAnalyzer {
  const left = windowOf(channels.left, fps);
  const right = windowOf(channels.right, fps);
  // Every modulation route asks for the same instants, so one millisecond is a fine cache key.
  const cache = new Map<number, AudioFeatures>();

  return {
    featuresAt(requested: number): AudioFeatures {
      const time = withinWindow(left, requested);
      const key = Math.round(time * 1000);

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
  const current = spectrumAt(left, time);
  const previous = spectrumAt(left, withinWindow(left, time - SMOOTH_LOOKBACK));
  const magnitudes = current.map((magnitude, index) => 0.6 * magnitude + 0.4 * previous[index]!);

  const loudness = loudnessAt(left, time);
  const before = loudnessAt(left, withinWindow(left, time - ONSET_LOOKBACK));

  return {
    ...spectrumFeatures({ magnitudes, sampleRate: left.sampleRate }),
    rms: loudness,
    onset: soft(Math.max(0, loudness - before) * 4),
    wave: { left: waveAt(left, time), right: waveAt(right, time) },
  };
}

/**
 * `visualizeAudio` clamps a short read to the start of the loaded window. Keep lookbacks far enough
 * inside the window so they represent the requested moment.
 */
function withinWindow(audioWindow: AudioWindow, time: number): number {
  const padding = SAMPLES / audioWindow.sampleRate;
  const firstTime = audioWindow.offsetSeconds + padding;
  const lastTime =
    audioWindow.offsetSeconds +
    (audioWindow.samples?.length ?? 0) / audioWindow.sampleRate -
    padding;
  if (lastTime <= firstTime) return time;
  return Math.min(Math.max(time, firstTime), lastTime);
}

function loudnessAt(audioWindow: AudioWindow, time: number): number {
  if (!audioWindow.samples) return 0;

  const center = Math.floor((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const halfWindow = Math.floor((audioWindow.sampleRate * RMS_WINDOW) / 2);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(audioWindow.samples.length, center + halfWindow);
  if (end <= start) return 0;

  return rms(audioWindow.samples.subarray(start, end));
}

/** The `WAVE_SECONDS` of samples that end at `time`. */
function waveAt(audioWindow: AudioWindow, time: number): number[] {
  const end = Math.round((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const start = end - Math.round(WAVE_SECONDS * audioWindow.sampleRate);
  return waveSlice(audioWindow.samples ?? [], start, end);
}

function spectrumAt(audioWindow: AudioWindow, time: number): number[] {
  return visualizeAudio({
    audioData: audioWindow.audioData,
    frame: time * audioWindow.fps,
    fps: audioWindow.fps,
    numberOfSamples: SAMPLES,
    smoothing: false,
    optimizeFor: 'speed',
    dataOffsetInSeconds: audioWindow.offsetSeconds,
  });
}
