import type { BeatEstimate, BeatTracker } from '../../packages/core/src/index.ts';
import type { EvaluationCase, ReferenceGrid } from './config.ts';

export function createMetrics() {
  return {
    observations: 0,
    eligible: 0,
    locked: 0,
    labeled: 0,
    labeledLocked: 0,
    correctLocks: 0,
    falseLocks: 0,
    tempoErrors: 0,
    phaseErrors: 0,
    forbiddenLocks: 0,
    firstLock: null as number | null,
    maxConfidence: 0,
    maxRetainedHops: 0,
    maxTempoError: 0,
    maxPhaseErrorBeats: 0,
  };
}
export type Metrics = ReturnType<typeof createMetrics>;

export function observe(metrics: Metrics, tracker: BeatTracker, at: number, entry: EvaluationCase) {
  metrics.observations++;
  metrics.maxConfidence = Math.max(metrics.maxConfidence, tracker.estimate?.confidence ?? 0);
  metrics.maxRetainedHops = Math.max(metrics.maxRetainedHops, tracker.retainedHops);
  const locked = tracker.state === 'locked' && tracker.estimate !== null;
  if (locked) metrics.firstLock ??= at;
  if (at < entry.at + 10) return { classification: 'warmup' };
  metrics.eligible++;
  if (locked) metrics.locked++;
  const reference = entry.reference?.find((grid) => at >= grid.from && at < grid.until);
  if (entry.reference !== null && !reference) return { classification: 'unlabeled' };
  metrics.labeled++;
  if (!locked) return { classification: 'unlocked' };
  metrics.labeledLocked++;
  if (entry.reference === null) {
    metrics.forbiddenLocks++;
    metrics.falseLocks++;
    return { classification: 'false-lock-no-grid' };
  }
  return recordErrors(metrics, gridError(tracker.estimate!, reference!, at));
}

function recordErrors(metrics: Metrics, errors: ReturnType<typeof gridError>) {
  metrics.maxTempoError = Math.max(metrics.maxTempoError, errors.tempo);
  metrics.maxPhaseErrorBeats = Math.max(metrics.maxPhaseErrorBeats, errors.phase);
  const wrongTempo = errors.tempo > 0.015;
  const wrongPhase = errors.phase > 0.1;
  if (wrongTempo) metrics.tempoErrors++;
  if (wrongPhase) metrics.phaseErrors++;
  if (wrongTempo || wrongPhase) metrics.falseLocks++;
  else metrics.correctLocks++;
  return { classification: wrongTempo || wrongPhase ? 'false-lock' : 'correct-lock', errors };
}

export function gridError(estimate: BeatEstimate, reference: ReferenceGrid, at: number) {
  const phase = (bpm: number, offset: number) => (((at - offset) * bpm) / 60) % 1;
  const difference =
    Math.abs(
      phase(estimate.bpm, estimate.beatOffset) - phase(reference.bpm, reference.beatOffset),
    ) % 1;
  return {
    tempo: Math.abs(estimate.bpm / reference.bpm - 1),
    phase: Math.min(difference, 1 - difference),
  };
}
