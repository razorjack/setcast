import { useEffect, useState } from 'react';
import {
  DEFAULT_PERFORMANCE,
  nextBar,
  rampAt,
  type PerformanceEvent,
  type PerformanceState,
  type ResolvedLiveProject,
} from '@setcast/core';
import type { LiveInput } from './input.ts';

interface Recall {
  preset: string;
  project: ResolvedLiveProject;
  at: number;
  duration: number;
  phase: 'queued' | 'out' | 'loading' | 'in';
}
interface PerformanceOptions {
  running?: boolean;
  time: () => number;
  recall: (project: ResolvedLiveProject, preset: string) => void;
  record: (event: PerformanceEvent) => void;
}

export class LivePerformance {
  target: PerformanceState;
  ramp: PerformanceEvent;
  blackout = false;
  transition: Recall | null = null;
  options: PerformanceOptions;
  changed: () => void;
  constructor(initial: PerformanceState, options: PerformanceOptions, changed: () => void) {
    this.target = initial;
    this.ramp = { at: 0, from: initial, to: initial, duration: 0 };
    this.options = options;
    this.changed = changed;
  }
  value = () => rampAt(this.ramp, this.options.time());
  private fade(to: PerformanceState, duration: number) {
    this.ramp = {
      at: this.options.time(),
      from: this.value(),
      to,
      duration: this.options.running === false ? 0 : duration,
    };
    this.options.record(this.ramp);
    this.changed();
  }
  change = (patch: Partial<PerformanceState>, duration = 0.15) => {
    if (this.transition) return;
    this.target = { ...this.target, ...patch };
    this.fade({ ...this.target, brightness: this.blackout ? 0 : this.target.brightness }, duration);
  };
  toggleBlackout = () => {
    this.blackout = !this.blackout;
    if (this.transition?.phase !== 'loading') this.transition = null;
    this.fade({ ...this.target, brightness: this.blackout ? 0 : this.target.brightness }, 0);
  };
  queue(
    preset: string,
    project: ResolvedLiveProject,
    timing: { bpm: number | null; beatOffset: number; duration: number; quantized: boolean },
  ) {
    if (this.transition && this.transition.phase !== 'queued') return;
    const time = this.options.time();
    const at = timing.quantized ? nextBar(time, timing.bpm, timing.beatOffset) : time;
    this.transition = { preset, project, at, duration: timing.duration, phase: 'queued' };
    this.changed();
  }
  tick = () => {
    const transition = this.transition;
    if (!transition) return;
    const time = this.options.time();
    if (transition.phase === 'queued' && time >= transition.at) {
      transition.phase = 'out';
      this.fade({ ...this.target, brightness: 0 }, transition.duration / 2);
    }
    if (transition.phase === 'out' && time >= this.ramp.at + this.ramp.duration) {
      transition.phase = 'loading';
      this.options.recall(transition.project, transition.preset);
      this.changed();
    }
    if (transition.phase === 'in' && time >= this.ramp.at + this.ramp.duration) {
      this.transition = null;
      this.changed();
    }
  };
  ready = () => {
    if (this.transition?.phase !== 'loading') return;
    this.transition.phase = 'in';
    this.fade(
      { ...this.target, brightness: this.blackout ? 0 : this.target.brightness },
      this.transition.duration / 2,
    );
  };
  cancel = () => {
    this.transition = null;
    this.fade({ ...this.target, brightness: this.blackout ? 0 : this.target.brightness }, 0.15);
  };
  reset = () => {
    this.transition = null;
    const state = { ...this.target, brightness: this.blackout ? 0 : this.target.brightness };
    this.ramp = { at: 0, from: state, to: state, duration: 0 };
    this.changed();
  };
}

export function usePerformance(
  initial: ResolvedLiveProject,
  input: LiveInput,
  options: PerformanceOptions,
) {
  const [, update] = useState(0);
  const [performance] = useState(
    () =>
      new LivePerformance(initial.performance ?? DEFAULT_PERFORMANCE, options, () =>
        update((value) => value + 1),
      ),
  );
  performance.options = options;
  useEffect(() => performance.reset(), [performance, input.capture.audio]);
  useEffect(() => performance.tick(), [performance, input.snapshot]);
  return performance;
}
