import { midiKey, type MidiAction, type MidiMapping, type MidiMessage } from './midi.ts';

export interface MidiControl {
  action: MidiAction;
  value: number;
}

/** Feed decoded messages and validated immutable mappings. Hosts own flush cadence. */
export class MidiControlBuffer {
  private mapping: MidiMapping | null = null;
  private pending = new Map<MidiAction, number>();
  private pressed = new Set<string>();

  push(message: MidiMessage, mapping: MidiMapping): MidiControl | null {
    this.sync(mapping);
    const key = midiKey(message);
    const action = mapping[key];
    if (!action) return null;
    if (action === 'intensity' || action === 'brightness') {
      this.pending.set(action, message.value);
      return null;
    }
    if (message.kind === 'cc') {
      if (message.value < 0.5) {
        this.pressed.delete(key);
        return null;
      }
      if (this.pressed.has(key)) return null;
      this.pressed.add(key);
    }
    return { action, value: message.value };
  }

  flush(mapping: MidiMapping): MidiControl[] {
    this.sync(mapping);
    const controls = [...this.pending].map(([action, value]) => ({ action, value }));
    this.pending.clear();
    return controls;
  }

  reset() {
    this.mapping = null;
    this.pending.clear();
    this.pressed.clear();
  }

  private sync(mapping: MidiMapping) {
    if (mapping === this.mapping) return;
    this.reset();
    this.mapping = mapping;
  }
}
