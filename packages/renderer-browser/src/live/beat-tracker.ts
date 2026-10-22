import {
  estimateBeat,
  validBeatRange,
  type BeatEstimate,
  type BeatRange,
} from './beat-estimate.ts';

interface BeatAudio {
  capturedTime: number;
  energyAt: (time: number) => number;
}

export class BeatTracker {
  state: 'listening' | 'locked' | 'uncertain' = 'listening';
  estimate: BeatEstimate | null = null;
  reason = 'Waiting for eight seconds of audio';
  private onsets: number[] = [];
  private previous = 0;
  private hop: number | null = null;
  private analyzed = 0;
  private stable = 0;
  private range: BeatRange = { min: 90, max: 180 };

  reset() {
    this.state = 'listening';
    this.estimate = null;
    this.reason = 'Waiting for eight seconds of audio';
    this.onsets = [];
    this.previous = 0;
    this.hop = null;
    this.analyzed = 0;
    this.stable = 0;
  }

  configure(range: BeatRange) {
    if (!validBeatRange(range)) throw new RangeError('Choose 40–240 BPM, at least 10 BPM apart.');
    this.range = range;
    this.reset();
  }

  update(audio: BeatAudio) {
    const end = Math.floor(audio.capturedTime * 100);
    if (this.hop !== null && (end < this.hop || end - this.hop > 100)) this.reset();
    this.hop ??= end;
    for (let hop = this.hop + 1; hop <= end; hop++) {
      const energy = Math.log1p(100 * audio.energyAt(hop / 100));
      this.onsets.push(Math.max(0, energy - this.previous));
      this.previous = energy;
    }
    this.hop = end;
    if (this.onsets.length > 800) this.onsets.splice(0, this.onsets.length - 800);
    if (this.onsets.length < 800 || end - this.analyzed < 50) return;
    this.analyzed = end;
    this.analyze(end);
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
