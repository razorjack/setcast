import {
  rms,
  SILENCE,
  soft,
  spectrumFeatures,
  type AudioAnalyzer,
  type AudioFeatures,
} from '@setcast/core';
import { visualizeAudio, type MediaUtilsAudioData } from '@remotion/media-utils';

const SAMPLES = 1024;
const ONSET_LOOKBACK = 0.06;

/** Turns Remotion's windowed audio data into Setcast's `AudioAnalyzer`. */
export function windowedAnalyzer(
  audioData: MediaUtilsAudioData,
  dataOffsetInSeconds: number,
  fps: number,
): AudioAnalyzer {
  const wave = audioData.channelWaveforms[0];
  const { sampleRate } = audioData;
  const cache = new Map<number, AudioFeatures>();

  const loudness = (time: number) => {
    if (!wave) return 0;
    const center = Math.floor((time - dataOffsetInSeconds) * sampleRate);
    const half = Math.floor(sampleRate / fps / 2);
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

  const featuresAt = (time: number): AudioFeatures => {
    const key = Math.round(time * 1000);
    const hit = cache.get(key);
    if (hit) return hit;
    let magnitudes: number[];
    try {
      const now = spectrumAt(time);
      const prev = spectrumAt(time - 1 / fps);
      magnitudes = now.map((v, i) => 0.6 * v + 0.4 * prev[i]!);
    } catch {
      return SILENCE;
    }
    const level = loudness(time);
    const features: AudioFeatures = {
      ...spectrumFeatures({ magnitudes, sampleRate }),
      rms: level,
      onset: soft(Math.max(0, level - loudness(time - ONSET_LOOKBACK)) * 4),
    };
    cache.set(key, features);
    return features;
  };

  return { featuresAt };
}
