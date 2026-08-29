import { rms, soft, spectrumFeatures, type AudioAnalyzer, type AudioFeatures } from '@setcast/core';
import { visualizeAudio, type MediaUtilsAudioData } from '@remotion/media-utils';

const SAMPLES = 1024;
const ONSET_LOOKBACK = 0.06;
/** Fixed seconds, not a frame, so features are the same at 30 and 60 fps. */
const SMOOTH_LOOKBACK = 1 / 30;
const RMS_WINDOW = 1 / 30;

interface AudioWindow {
  audioData: MediaUtilsAudioData;
  offsetSeconds: number;
  fps: number;
  wave: Float32Array | undefined;
  sampleRate: number;
}

/** Turns Remotion's windowed audio data into Setcast's `AudioAnalyzer`. */
export function windowedAnalyzer(
  audioData: MediaUtilsAudioData,
  dataOffsetInSeconds: number,
  fps: number,
): AudioAnalyzer {
  const audioWindow: AudioWindow = {
    audioData,
    offsetSeconds: dataOffsetInSeconds,
    fps,
    wave: audioData.channelWaveforms[0],
    sampleRate: audioData.sampleRate,
  };
  const cache = new Map<number, AudioFeatures>();

  const featuresAt = (requested: number): AudioFeatures => {
    const time = withinWindow(audioWindow, requested);
    const key = Math.round(time * 1000);
    const cached = cache.get(key);
    if (cached) return cached;

    const current = spectrumAt(audioWindow, time);
    const previousTime = withinWindow(audioWindow, time - SMOOTH_LOOKBACK);
    const previous = spectrumAt(audioWindow, previousTime);
    const magnitudes = current.map((magnitude, index) => 0.6 * magnitude + 0.4 * previous[index]!);
    const level = loudnessAt(audioWindow, time);
    const onsetTime = withinWindow(audioWindow, time - ONSET_LOOKBACK);
    const features: AudioFeatures = {
      ...spectrumFeatures({ magnitudes, sampleRate: audioWindow.sampleRate }),
      rms: level,
      onset: soft(Math.max(0, level - loudnessAt(audioWindow, onsetTime)) * 4),
    };

    cache.set(key, features);
    return features;
  };

  return { featuresAt };
}

/**
 * `visualizeAudio` clamps a short read to the start of the loaded window. Keep lookbacks far enough
 * inside the window so they represent the requested moment.
 */
function withinWindow(audioWindow: AudioWindow, time: number): number {
  const padding = SAMPLES / audioWindow.sampleRate;
  const firstTime = audioWindow.offsetSeconds + padding;
  const lastTime =
    audioWindow.offsetSeconds + (audioWindow.wave?.length ?? 0) / audioWindow.sampleRate - padding;
  if (lastTime <= firstTime) return time;
  return Math.min(Math.max(time, firstTime), lastTime);
}

function loudnessAt(audioWindow: AudioWindow, time: number): number {
  if (!audioWindow.wave) return 0;

  const center = Math.floor((time - audioWindow.offsetSeconds) * audioWindow.sampleRate);
  const halfWindow = Math.floor((audioWindow.sampleRate * RMS_WINDOW) / 2);
  const start = Math.max(0, center - halfWindow);
  const end = Math.min(audioWindow.wave.length, center + halfWindow);
  if (end <= start) return 0;

  return rms(audioWindow.wave.subarray(start, end));
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
