// A deterministic drum & bass sketch at 174 BPM: intro, buildup, drop, breakdown, buildup, drop.
// Pure Node, no dependencies. Used by `setcast init --demo` and by the repo's demo assets task.

const RATE = 44100;
const BPM = 174;
const STEP = 60 / BPM / 4;
const BAR = STEP * 16;
const E1_HZ = 41.2;
const BASSLINE = [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 5, 5, 3, 0];
const KICK_STEPS = new Set([0, 10]);
const SNARE_STEPS = new Set([4, 12]);

type Section = 'intro' | 'buildup' | 'drop' | 'breakdown';
const FULL: [Section, number][] = [
  ['intro', 16],
  ['buildup', 8],
  ['drop', 32],
  ['breakdown', 16],
  ['buildup', 8],
  ['drop', 32],
];

export interface DemoSection {
  name: Section;
  startSeconds: number;
  bars: number;
}

export interface DemoAudio {
  wav: Buffer;
  durationSeconds: number;
  sections: DemoSection[];
}

/** `scale` shortens every section (0.25 = a 40 s sketch); 1 is the full 2:34. */
export function synthesizeDemo(scale = 1): DemoAudio {
  const arrangement = FULL.map(([name, bars]): [Section, number] => [
    name,
    Math.max(2, Math.round(bars * scale)),
  ]);
  const totalBars = arrangement.reduce((sum, [, bars]) => sum + bars, 0);
  const samples = Math.round(totalBars * BAR * RATE);
  const mono = renderMono(samples, arrangement);
  let elapsedBars = 0;
  const sections = arrangement.map(([name, bars]) => {
    const section = { name, startSeconds: elapsedBars * BAR, bars };
    elapsedBars += bars;
    return section;
  });
  return { wav: toWav(mono), durationSeconds: samples / RATE, sections };
}

interface SynthState {
  random: () => number;
  filteredReese: number;
  filteredPad: number;
  previousNoise: number;
}

interface SynthFrame {
  time: number;
  step: number;
  timeInStep: number;
  section: Section;
  sectionProgress: number;
  inDrop: boolean;
  hasDrums: boolean;
}

function renderMono(sampleCount: number, arrangement: [Section, number][]): Float32Array {
  const output = new Float32Array(sampleCount);
  const state: SynthState = {
    random: deterministicNoise(),
    filteredReese: 0,
    filteredPad: 0,
    previousNoise: 0,
  };

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const frame = synthFrame(sampleIndex, arrangement);
    output[sampleIndex] = Math.tanh(sampleAt(frame, state) * 1.1);
  }

  normalize(output);
  return output;
}

function deterministicNoise(): () => number {
  let seed = 0x9e3779b9;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function synthFrame(sampleIndex: number, arrangement: [Section, number][]): SynthFrame {
  const time = sampleIndex / RATE;
  const bar = Math.floor(time / BAR);
  const stepPosition = (time % BAR) / STEP;
  const step = Math.floor(stepPosition);
  const [section, sectionProgress] = sectionAt(arrangement, bar);
  const inDrop = section === 'drop';
  const hasDrums =
    inDrop || section === 'breakdown' || (section === 'buildup' && sectionProgress > 0.3);
  return {
    time,
    step,
    timeInStep: (stepPosition - step) * STEP,
    section,
    sectionProgress,
    inDrop,
    hasDrums,
  };
}

function sectionAt(arrangement: [Section, number][], bar: number): [Section, number] {
  let start = 0;
  for (const [name, length] of arrangement) {
    if (bar < start + length) return [name, (bar - start) / length];
    start += length;
  }
  return ['drop', 1];
}

function sampleAt(frame: SynthFrame, state: SynthState): number {
  let sample = drumsAt(frame, state);
  sample += bassAt(frame, state);
  sample += padAt(frame, state);
  sample += riserAt(frame, state);
  return sample;
}

function drumsAt(frame: SynthFrame, state: SynthState): number {
  let sample = 0;
  if (frame.hasDrums && KICK_STEPS.has(frame.step) && canKick(frame)) {
    const frequency = 48 + 140 * Math.exp(-frame.timeInStep / 0.035);
    sample +=
      Math.sin(2 * Math.PI * frequency * frame.timeInStep) * envelope(frame.timeInStep, 0.18) * 0.9;
    sample += state.random() * envelope(frame.timeInStep, 0.004) * 0.4;
  }
  if (frame.hasDrums && SNARE_STEPS.has(frame.step) && frame.section !== 'breakdown') {
    sample += state.random() * envelope(frame.timeInStep, 0.09) * 0.5;
    sample +=
      Math.sin(2 * Math.PI * 190 * frame.timeInStep) * envelope(frame.timeInStep, 0.05) * 0.4;
  }
  if (frame.section === 'buildup' && frame.sectionProgress > 0.75 && frame.step % 2 === 0) {
    sample += state.random() * envelope(frame.timeInStep, 0.05) * 0.45;
  }
  if ((frame.hasDrums || frame.section === 'intro') && frame.step % 2 === 0) {
    const noise = state.random();
    const highPass = noise - state.previousNoise;
    state.previousNoise = noise;
    const decay = frame.step % 4 === 0 ? 0.03 : 0.015;
    sample += highPass * envelope(frame.timeInStep, decay) * (frame.inDrop ? 0.35 : 0.2);
  }
  return sample;
}

function canKick(frame: SynthFrame): boolean {
  return frame.section !== 'breakdown' || frame.step === 0;
}

function bassAt(frame: SynthFrame, state: SynthState): number {
  if (!frame.inDrop) return 0;

  const note = noteHz(BASSLINE[frame.step]!);
  const gate = envelope(frame.timeInStep, 0.5) * 0.6 + 0.4;
  const sub = Math.sin(2 * Math.PI * note * frame.time) * 0.55 * gate;
  const reese =
    (saw(note * 2 * frame.time) +
      saw(note * 2 * 1.012 * frame.time) +
      saw(note * 1.002 * frame.time)) /
    3;
  const cutoff = 260 + 640 * (0.5 + 0.5 * Math.sin(2 * Math.PI * frame.time * 0.2));
  const response = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  state.filteredReese += response * (reese - state.filteredReese);
  return sub + state.filteredReese * 0.55;
}

function padAt(frame: SynthFrame, state: SynthState): number {
  if (frame.inDrop) return 0;

  const root = noteHz(0) * 4;
  let pad = 0;
  for (const ratio of [1, 1.498, 1.189, 2.0]) {
    pad += saw(root * ratio * frame.time) + saw(root * ratio * 1.004 * frame.time + 0.3);
  }
  const swell =
    frame.section === 'buildup'
      ? 0.3 + 0.7 * frame.sectionProgress
      : 0.5 + 0.5 * Math.sin(2 * Math.PI * frame.time * 0.05);
  const cutoff = 300 + 1200 * swell;
  const response = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  state.filteredPad += response * (pad / 8 - state.filteredPad);

  let sample = state.filteredPad * 0.35;
  if (frame.section === 'breakdown' && frame.step === 0) {
    sample +=
      Math.sin(2 * Math.PI * noteHz(0) * frame.time) * envelope(frame.timeInStep, 0.6) * 0.5;
  }
  return sample;
}

function riserAt(frame: SynthFrame, state: SynthState): number {
  if (frame.section !== 'buildup') return 0;

  const progress = frame.sectionProgress;
  const riser = Math.sin(2 * Math.PI * (200 + 1800 * progress * progress) * frame.time);
  return riser * 0.08 * progress + state.random() * 0.12 * progress * progress;
}

function normalize(output: Float32Array): void {
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  const gain = 0.89 / peak;
  for (let sampleIndex = 0; sampleIndex < output.length; sampleIndex++) {
    output[sampleIndex]! *= gain;
  }
}

const noteHz = (semitones: number) => E1_HZ * 2 ** (semitones / 12);
const saw = (phase: number) => 2 * (phase - Math.floor(phase + 0.5));
const envelope = (time: number, decay: number) => (time < 0 ? 0 : Math.exp(-time / decay));

function toWav(mono: Float32Array): Buffer {
  const header = 44;
  const wav = Buffer.alloc(header + mono.length * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + mono.length * 4, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(mono.length * 4, 40);
  for (let sampleIndex = 0; sampleIndex < mono.length; sampleIndex++) {
    const sample = Math.round(mono[sampleIndex]! * 32767);
    wav.writeInt16LE(sample, header + sampleIndex * 4);
    wav.writeInt16LE(sample, header + sampleIndex * 4 + 2);
  }
  return wav;
}
