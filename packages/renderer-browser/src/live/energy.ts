import type { AudioFeatures, EnergyBand, EnergySelection } from '@setcast/core';

/** Energy classification uses available capture time, independently of visual intensity and delay. */
export class LiveEnergy {
  level = 0;
  band: EnergyBand | null = null;
  candidate: EnergyBand | null = null;
  private since = 0;
  private previous: number | null = null;
  reset() {
    this.level = 0;
    this.band = null;
    this.candidate = null;
    this.previous = null;
  }
  update(time: number, audio: AudioFeatures, settings: EnergySelection) {
    if (!Number.isFinite(time) || (this.previous !== null && time < this.previous)) this.reset();
    if (!Number.isFinite(time)) return;
    const delta = this.previous === null ? 0 : time - this.previous;
    if (delta > 1) this.reset();
    if (this.previous !== null && delta < 0.1 - 1e-6) return;
    const energy = Math.min(1, Math.max(0, 0.5 * audio.rms + 0.5 * audio.bass));
    const weight = this.previous === null ? 1 : 1 - Math.exp(-delta / settings.smooth);
    this.level += (energy - this.level) * weight;
    this.previous = time;
    const candidate = classifyEnergy(this.level, this.band, settings);
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.since = time;
    }
    if (time - this.since >= settings.sustain) this.band = candidate;
  }
}
function classifyEnergy(
  level: number,
  band: EnergyBand | null,
  settings: EnergySelection,
): EnergyBand {
  let low = settings.low;
  let high = settings.high;
  if (band === 'low') low += settings.hysteresis;
  if (band === 'high') high -= settings.hysteresis;
  if (band === 'medium') {
    low -= settings.hysteresis;
    high += settings.hysteresis;
  }
  if (level < low) return 'low';
  if (level >= high) return 'high';
  return 'medium';
}
