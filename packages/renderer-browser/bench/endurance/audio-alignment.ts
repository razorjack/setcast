export const AUDIO_CHECK = {
  sampleRate: 16000,
  channels: 2,
  windowSamples: 16000,
  searchSamples: 800,
};
type Settings = typeof AUDIO_CHECK & { channel?: number };

/** Positive lag means the exported audio arrives later than the source. */
export function audioAlignment(source: Float32Array, output: Float32Array, settings = AUDIO_CHECK) {
  const { channels, windowSamples, searchSamples, sampleRate } = settings;
  const required = (windowSamples + 2 * searchSamples) * channels;
  if (source.length < required || output.length < required)
    throw new Error(`Audio window is incomplete: expected ${required} interleaved samples.`);
  if (!source.every(Number.isFinite) || !output.every(Number.isFinite))
    throw new Error('Audio window contains nonfinite samples.');
  const scores: number[] = [];
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -searchSamples; lag <= searchSamples; lag++) {
    const score = correlation(source, output, lag, settings).correlation;
    scores.push(score);
    if (
      score > bestScore + 1e-12 ||
      (Math.abs(score - bestScore) <= 1e-12 && Math.abs(lag) < Math.abs(best))
    ) {
      best = lag;
      bestScore = score;
    }
  }
  const matched = correlation(source, output, best, settings);
  const separated = Math.ceil(sampleRate * 0.002);
  let competitor = -1;
  for (let index = 0; index < scores.length; index++)
    if (Math.abs(index - searchSamples - best) >= separated)
      competitor = Math.max(competitor, scores[index]!);
  const margin = bestScore - competitor;
  const lagMilliseconds = (best / sampleRate) * 1000;
  const levelRatio = matched.outputRms / Math.max(matched.sourceRms, 1e-30);
  let status: ReturnType<typeof alignmentStatus> = alignmentStatus({
    ...matched,
    margin,
    lagMilliseconds,
    levelRatio,
  });
  const channelChecks = compareChannels(source, output, best, settings);
  if (status === 'passed' && channelChecks.some((check) => !check.passed)) status = 'mismatch';
  return {
    status,
    lagSamples: best,
    lagMilliseconds,
    ...matched,
    zeroLagCorrelation: scores[searchSamples]!,
    margin,
    levelRatio,
    channelChecks,
  };
}

function compareChannels(
  source: Float32Array,
  output: Float32Array,
  lag: number,
  settings: Settings,
) {
  const { channels } = settings;
  return Array.from({ length: channels }, (_, channel) => {
    const match = correlation(source, output, lag, { ...settings, channel });
    const ratio = match.outputRms / Math.max(match.sourceRms, 1e-30);
    const passed =
      match.sourceRms < 0.0001
        ? match.outputRms < 0.0001
        : match.correlation >= 0.95 && ratio >= 0.9 && ratio <= 1.1;
    return { channel, ...match, levelRatio: ratio, passed };
  });
}

function alignmentStatus(result: {
  sourceRms: number;
  outputRms: number;
  correlation: number;
  margin: number;
  lagMilliseconds: number;
  levelRatio: number;
}) {
  if (result.sourceRms < 0.0001) return 'inconclusive-silence' as const;
  if (result.outputRms < 0.0001 || result.correlation < 0.95) return 'mismatch' as const;
  if (result.margin < 0.005) return 'inconclusive-periodic' as const;
  if (Math.abs(result.lagMilliseconds) > 1) return 'shifted' as const;
  if (result.levelRatio < 0.9 || result.levelRatio > 1.1) return 'level-mismatch' as const;
  return 'passed' as const;
}

function correlation(source: Float32Array, output: Float32Array, lag: number, settings: Settings) {
  const { channels, searchSamples, windowSamples } = settings;
  let xy = 0;
  let xx = 0;
  let yy = 0;
  const start = searchSamples * channels;
  const end = start + windowSamples * channels;
  const step = settings.channel === undefined ? 1 : channels;
  for (let index = start + (settings.channel ?? 0); index < end; index += step) {
    const x = source[index]!;
    const y = output[index + lag * channels]!;
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  const count = (end - start) / step;
  return {
    correlation: xx && yy ? xy / Math.sqrt(xx * yy) : 0,
    sourceRms: Math.sqrt(xx / count),
    outputRms: Math.sqrt(yy / count),
  };
}
