import { coversPcmLookback, pcmAnalyzer, type PcmWindow } from '@setcast/core';
import type { MediaUtilsAudioData } from '@remotion/media-utils';

export interface ChannelWindow {
  audioData: MediaUtilsAudioData;
  dataOffsetInSeconds: number;
}

const windowOf = ({ audioData, dataOffsetInSeconds }: ChannelWindow): PcmWindow => ({
  samples: audioData.channelWaveforms[0] ?? new Float32Array(),
  sampleRate: audioData.sampleRate,
  offsetSeconds: dataOffsetInSeconds,
  durationSeconds: audioData.durationInSeconds,
});

export const coversLookback = (channel: ChannelWindow, time: number): boolean =>
  coversPcmLookback(windowOf(channel), time);

export function windowedAnalyzer(
  channels: { left: ChannelWindow; right: ChannelWindow },
  _fps: number,
) {
  const left = windowOf(channels.left);
  const right = channels.right === channels.left ? left : windowOf(channels.right);
  return pcmAnalyzer({ left, right });
}
