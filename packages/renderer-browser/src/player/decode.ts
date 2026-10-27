import { FFT_SIZE, HISTORY_SECONDS, pcmAnalyzer, type PcmWindow } from '@setcast/core';
import { ALL_FORMATS, AudioBufferSink, Input, UrlSource, type InputAudioTrack } from 'mediabunny';
import { AnalysisWindows, WINDOW_SECONDS } from '../windows.ts';

export async function openAnalysis(src: string, duration: number) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      maxCacheSize: 16 * 1024 * 1024,
      getRetryDelay: (attempt) => (attempt < 2 ? 0.25 : null),
    }),
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) {
      throw new Error(
        'This browser cannot decode the set for analysis. Try current Chrome or re-export the audio as PCM WAV.',
      );
    }
    if (track.numberOfChannels > 2)
      throw new Error(
        'Playback analysis supports mono or stereo audio. Re-export the set in stereo.',
      );
    const windows = new AnalysisWindows((index, signal) =>
      decodeWindow(track, duration, index, signal),
    );
    return {
      windows,
      dispose: () => {
        windows.dispose();
        input.dispose();
      },
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

async function decodeWindow(
  track: InputAudioTrack,
  duration: number,
  index: number,
  signal: AbortSignal,
) {
  const rate = track.sampleRate;
  const padding = Math.max(0.2, FFT_SIZE / 2 / rate + 0.1);
  const first = Math.floor(Math.max(0, index * WINDOW_SECONDS - HISTORY_SECONDS - padding) * rate);
  const last = Math.ceil(Math.min(duration, (index + 1) * WINDOW_SECONDS + padding) * rate);
  const left = new Float32Array(last - first);
  const right = track.numberOfChannels === 1 ? left : new Float32Array(last - first);
  const sink = new AudioBufferSink(track);
  // Compressed frames can depend on preceding packets (FLAC can span nearly 1.5 s).
  const buffers = sink.buffers(Math.max(0, first / rate - 1.5), last / rate);
  for await (const { buffer, timestamp } of buffers) {
    signal.throwIfAborted();
    if (buffer.sampleRate !== rate)
      throw new Error(
        'Audio sample rate changed during playback. Re-export the set with a fixed sample rate.',
      );
    copyPcm(left, buffer.getChannelData(0), Math.round(timestamp * rate) - first);
    if (right !== left)
      copyPcm(right, buffer.getChannelData(1), Math.round(timestamp * rate) - first);
  }
  signal.throwIfAborted();
  const channel = (samples: Float32Array): PcmWindow => ({
    samples,
    sampleRate: rate,
    offsetSeconds: first / rate,
    durationSeconds: duration,
  });
  const leftWindow = channel(left);
  return pcmAnalyzer({ left: leftWindow, right: right === left ? leftWindow : channel(right) });
}

export function copyPcm(target: Float32Array, source: Float32Array, offset: number) {
  const sourceStart = Math.max(0, -offset);
  const targetStart = Math.max(0, offset);
  const length = Math.min(source.length - sourceStart, target.length - targetStart);
  if (length > 0) target.set(source.subarray(sourceStart, sourceStart + length), targetStart);
}
