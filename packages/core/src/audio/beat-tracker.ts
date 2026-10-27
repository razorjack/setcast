import { BEAT_WINDOW_HOPS, validBeatRange, type BeatOnset, type BeatRange } from './beat.ts';
import { estimateBeat, type BeatEstimate } from './beat-estimate.ts';

export type BeatTrackingState = 'listening' | 'locked' | 'uncertain';

/** Bounded evidence tracker. A lock is a candidate for explicit adoption, never an output clock. */
export class BeatTracker {
  state: BeatTrackingState = 'listening';
  estimate: BeatEstimate | null = null;
  reason = 'Waiting for eight seconds of audio';
  private onsets: number[] = [];
  private hop: number | null = null;
  private analyzed = 0;
  private stable = 0;
  private range: BeatRange = { min: 90, max: 180 };

  get retainedHops(): number {
    return this.onsets.length;
  }

  reset() {
    this.state = 'listening';
    this.estimate = null;
    this.reason = 'Waiting for eight seconds of audio';
    this.onsets = [];
    this.hop = null;
    this.analyzed = 0;
    this.stable = 0;
  }

  configure(range: BeatRange) {
    if (!validBeatRange(range)) throw new RangeError('Choose 40–240 BPM, at least 10 BPM apart.');
    this.range = { ...range };
    this.reset();
  }

  push({ hop, value }: BeatOnset) {
    if (!Number.isSafeInteger(hop) || hop < 0 || !Number.isFinite(value) || value < 0)
      throw new RangeError(
        'BeatTracker.push requires a safe nonnegative hop and finite nonnegative onset value.',
      );
    if (this.hop !== null && hop <= this.hop)
      throw new RangeError(
        'BeatTracker.push requires strictly increasing hops. Reset before restarting the source clock.',
      );
    if (this.hop !== null && hop !== this.hop + 1) this.reset();
    this.hop = hop;
    this.onsets.push(value);
    if (this.onsets.length > BEAT_WINDOW_HOPS) this.onsets.shift();
    if (this.onsets.length < BEAT_WINDOW_HOPS || hop - this.analyzed < 50) return;
    this.analyzed = hop;
    this.analyze(hop);
  }

  private analyze(end: number) {
    const onset = this.onsets.reduce((sum, value) => sum + value, 0);
    const recent = this.onsets.slice(-150).reduce((sum, value) => sum + value, 0);
    const next = estimateBeat(this.onsets, (end - 799) / 100, this.range);
    const reliable = next.confidence >= 0.55 && !next.ambiguous && onset > 1 && recent > 0.2;
    const steady = this.estimate && sameBeatGrid(this.estimate, next, end / 100);
    this.stable = steady ? this.stable + 1 : 1;
    if (!reliable) this.stable = 0;
    this.estimate = next;
    this.state = this.stable >= 3 ? 'locked' : 'uncertain';
    if (recent <= 0.2) this.reason = 'No recent rhythmic transients';
    else if (next.ambiguous) this.reason = 'Competing tempos; narrow the range or tap manually';
    else if (next.recentAgreement < 0.55)
      this.reason = 'Recent transients disagree with the estimated grid';
    else if (!reliable) this.reason = 'Weak or irregular beat evidence';
    else
      this.reason =
        this.state === 'locked' ? 'Stable beat estimate; downbeat unknown' : 'Confirming tempo';
  }
}

function sameBeatGrid(previous: BeatEstimate, next: BeatEstimate, time: number) {
  const phase = (estimate: BeatEstimate) =>
    (((time - estimate.beatOffset) * estimate.bpm) / 60) % 1;
  const difference = Math.abs(phase(previous) - phase(next));
  return (
    Math.abs(next.bpm / previous.bpm - 1) < 0.015 && Math.min(difference, 1 - difference) < 0.1
  );
}
