import {
  EnergySelectionSchema,
  type EnergyBand,
  type EnergySelection,
  type SceneSequence,
} from '@setcast/core';
import { LiveEnergy } from './energy.ts';
import type { Report } from '../browser/report.ts';

type Entry = SceneSequence['scenes'][number];
interface SequenceOptions {
  recall: (preset: string) => Promise<boolean>;
  cancel: () => void;
  report: Report;
  changed: () => void;
}

export class LiveSequence {
  scenes: Entry[];
  loop: boolean;
  mode: 'ordered' | 'energy';
  energy: EnergySelection;
  readonly listening = new LiveEnergy();
  running = false;
  pending = false;
  index = -1;
  elapsed = 0;
  private completed = false;
  private previous: number | null = null;
  private generation = 0;
  options: SequenceOptions;

  constructor(initial: SceneSequence | undefined, options: SequenceOptions) {
    this.scenes = initial?.scenes ?? [];
    this.loop = initial?.loop ?? true;
    this.mode = initial?.mode ?? 'ordered';
    this.energy = initial?.energy ?? EnergySelectionSchema.parse({});
    this.options = options;
  }
  configure(
    scenes: Entry[],
    loop: boolean,
    selection?: { mode: 'ordered' | 'energy'; energy: EnergySelection },
  ) {
    this.stop();
    this.scenes = scenes;
    if (selection) {
      this.mode = selection.mode;
      this.energy = selection.energy;
    }
    this.listening.reset();
    this.loop = loop;
    this.index = -1;
    this.elapsed = 0;
    this.completed = false;
    this.options.changed();
  }
  start(active: string | null) {
    if (!this.scenes.length || this.pending) return;
    this.running = true;
    this.previous = null;
    if (this.completed) {
      this.completed = false;
      void this.select(0);
      return;
    }
    if (this.index >= 0 && this.scenes[this.index]?.preset !== active) {
      this.index = -1;
      this.elapsed = 0;
    }
    if (this.index < 0) this.index = this.scenes.findIndex((scene) => scene.preset === active);
    if (this.index < 0) void this.select(0);
    this.options.changed();
  }
  hold() {
    this.running = false;
    this.previous = null;
    this.options.cancel();
    this.options.changed();
  }
  stop() {
    this.generation++;
    this.pending = false;
    this.hold();
  }
  tick(time: number, available: boolean) {
    const delta = this.previous === null ? 0 : Math.max(0, time - this.previous);
    this.previous = time;
    if (!this.running || this.pending || !available) return;
    this.elapsed += delta;
    const current = this.scenes[this.index];
    if (!current || this.elapsed < current.seconds) return;
    if (this.mode === 'ordered') this.next();
    else this.followEnergy(this.listening.band);
  }
  next() {
    if (this.pending || !this.scenes.length) return;
    const next = this.index + 1;
    if (next >= this.scenes.length && (!this.loop || this.scenes.length === 1)) {
      this.completed = true;
      this.hold();
      return;
    }
    void this.select(next % this.scenes.length);
  }
  private followEnergy(band: EnergyBand | null) {
    if (!band) return;
    const candidates = this.scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ index }) => this.loop || index >= this.index);
    let matching = candidates.filter(({ scene }) => scene.energy === band);
    if (!matching.length)
      matching = candidates.filter(({ scene }) => (scene.energy ?? 'any') === 'any');
    const next = matching.find(({ index }) => index > this.index) ?? matching[0];
    if (next && next.index !== this.index) void this.select(next.index);
    else if (!this.loop && this.index === this.scenes.length - 1) {
      this.completed = true;
      this.hold();
    }
  }
  private async select(index: number) {
    const generation = ++this.generation;
    const scene = this.scenes[index]!;
    this.pending = true;
    this.options.changed();
    let success = false;
    try {
      success = await this.options.recall(scene.preset);
    } catch (error) {
      this.options.report(
        `Sequence could not recall ${scene.preset}: ${String(error)}. Fix the scene and resume.`,
      );
    }
    if (generation !== this.generation) return;
    this.pending = false;
    if (success) {
      this.index = index;
      this.elapsed = 0;
      this.previous = null;
    } else {
      this.running = false;
    }
    this.options.changed();
  }
}
