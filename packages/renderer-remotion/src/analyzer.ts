import { rms, soft, spectrumFeatures, type AudioAnalyzer, type AudioFeatures } from '@setcast/core';
import { visualizeAudio, type MediaUtilsAudioData } from '@remotion/media-utils';

const SAMPLES = 1024;
const ONSET_LOOKBACK = 0.06;
/** Fixed seconds, not a frame, so features are the same at 30 and 60 fps. */
const SMOOTH_LOOKBACK = 1 / 30;
const RMS_WINDOW = 1 / 30;

/** Turns Remotion's windowed audio data into Setcast's `AudioAnalyzer`. */
export function windowedAnalyzer(
  audioData: MediaUtilsAudioData,
  dataOffsetInSeconds: number,
  fps: number,
): AudioAnalyzer {
  const wave = audioData.channelWaveforms[0];
  const { sampleRate } = audioData;
  const cache = new Map<number, AudioFeatures>();

  // visualizeAudio reads SAMPLES either side of the instant and clamps a short read to the start
  // of the window instead of failing, so a lookback past the edge silently returns the wrong
  // moment's audio. Keep every request far enough inside the loaded window to be real.
  const inWindow = (time: number): number => {
    const pad = SAMPLES / sampleRate;
    const lo = dataOffsetInSeconds + pad;
    const hi = dataOffsetInSeconds + (wave?.length ?? 0) / sampleRate - pad;
    return hi > lo ? Math.min(Math.max(time, lo), hi) : time;
  };

  const loudness = (time: number) => {
    if (!wave) return 0;
    const center = Math.floor((time - dataOffsetInSeconds) * sampleRate);
    const half = Math.floor((sampleRate * RMS_WINDOW) / 2);
    const from = Math.max(0, center - half);
    const to = Math.min(wave.length, center + half);
    return to > from ? rms(wave.subarray(from, to)) : 0;
  };

  const spectrumAt = (time: number) =>
    visualizeAudio({
      audioData,
      frame: time * fps,
      fps,
      numberOfSamples: SAMPLES,
      smoothing: false,
      optimizeFor: 'speed',
      dataOffsetInSeconds,
    });

  const featuresAt = (requested: number): AudioFeatures => {
    const time = inWindow(requested);
    const key = Math.round(time * 1000);
    const hit = cache.get(key);
    if (hit) return hit;
    const now = spectrumAt(time);
    const prev = spectrumAt(inWindow(time - SMOOTH_LOOKBACK));
    const magnitudes = now.map((v, i) => 0.6 * v + 0.4 * prev[i]!);
    const level = loudness(time);
    const features: AudioFeatures = {
      ...spectrumFeatures({ magnitudes, sampleRate }),
      rms: level,
      onset: soft(Math.max(0, level - loudness(inWindow(time - ONSET_LOOKBACK))) * 4),
    };
    cache.set(key, features);
    return features;
  };

  return { featuresAt };
}
