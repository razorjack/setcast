import { BeatTracker as CoreBeatTracker } from '@setcast/core';

interface BeatAudio {
  capturedTime: number;
  energyAt: (time: number) => number;
}

/** Maps the capture ring's stereo energy to the shared, explicit-hop evidence tracker. */
export class BeatTracker extends CoreBeatTracker {
  private previous = 0;
  private sourceHop: number | null = null;

  override reset() {
    super.reset();
    this.previous = 0;
    this.sourceHop = null;
  }

  update(audio: BeatAudio) {
    const end = Math.floor(audio.capturedTime * 100);
    if (!Number.isSafeInteger(end) || end < 0)
      throw new RangeError('Beat input requires a finite, nonnegative capture clock.');
    if (this.sourceHop !== null && (end < this.sourceHop || end - this.sourceHop > 100))
      this.reset();
    this.sourceHop ??= end;
    for (let hop = this.sourceHop + 1; hop <= end; hop++) {
      const energy = Math.log1p(100 * audio.energyAt(hop / 100));
      this.push({ hop, value: Math.max(0, energy - this.previous) });
      this.previous = energy;
    }
    this.sourceHop = end;
  }
}
