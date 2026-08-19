// A deterministic drum & bass sketch at 174 BPM: intro, buildup, drop, breakdown, buildup, drop.
// Pure Node, no dependencies. Used by `setcast init --demo` and by the repo's demo assets task.

const RATE = 44100;
const BPM = 174;
const STEP = 60 / BPM / 4;
const BAR = STEP * 16;

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
  const totalBars = arrangement.reduce((n, [, b]) => n + b, 0);
  const samples = Math.round(totalBars * BAR * RATE);
  const mono = renderMono(samples, arrangement);
  let bar = 0;
  const sections = arrangement.map(([name, bars]) => {
    const s = { name, startSeconds: bar * BAR, bars };
    bar += bars;
    return s;
  });
  return { wav: toWav(mono), durationSeconds: samples / RATE, sections };
}

function renderMono(samples: number, arrangement: [Section, number][]): Float32Array {
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  const sectionAt = (bar: number): [Section, number] => {
    let start = 0;
    for (const [name, len] of arrangement) {
      if (bar < start + len) return [name, (bar - start) / len];
      start += len;
    }
    return ['drop', 1];
  };

  const E1 = 41.2;
  const bassline = [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 5, 5, 3, 0];
  const noteHz = (semis: number) => E1 * 2 ** (semis / 12);
  const saw = (phase: number) => 2 * (phase - Math.floor(phase + 0.5));
  const env = (t: number, decay: number) => (t < 0 ? 0 : Math.exp(-t / decay));
  const kickSteps = new Set([0, 10]);
  const snareSteps = new Set([4, 12]);

  const out = new Float32Array(samples);
  let lpReese = 0;
  let lpPad = 0;
  let prevNoise = 0;

  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    const bar = Math.floor(t / BAR);
    const stepF = (t % BAR) / STEP;
    const step = Math.floor(stepF);
    const tInStep = (stepF - step) * STEP;
    const [section, pos] = sectionAt(bar);
    const inDrop = section === 'drop';
    const drums = inDrop || section === 'breakdown' || (section === 'buildup' && pos > 0.3);
    let s = 0;

    if (drums && kickSteps.has(step) && (section !== 'breakdown' || step === 0)) {
      const f = 48 + 140 * Math.exp(-tInStep / 0.035);
      s += Math.sin(2 * Math.PI * f * tInStep) * env(tInStep, 0.18) * 0.9;
      s += rand() * env(tInStep, 0.004) * 0.4;
    }
    if (drums && snareSteps.has(step) && section !== 'breakdown') {
      s += rand() * env(tInStep, 0.09) * 0.5;
      s += Math.sin(2 * Math.PI * 190 * tInStep) * env(tInStep, 0.05) * 0.4;
    }
    if (section === 'buildup' && pos > 0.75 && step % 2 === 0) {
      s += rand() * env(tInStep, 0.05) * 0.45;
    }
    if ((drums || section === 'intro') && step % 2 === 0) {
      const n = rand();
      const hp = n - prevNoise;
      prevNoise = n;
      s += hp * env(tInStep, step % 4 === 0 ? 0.03 : 0.015) * (inDrop ? 0.35 : 0.2);
    }

    if (inDrop) {
      const note = noteHz(bassline[step]!);
      const gate = env(tInStep, 0.5) * 0.6 + 0.4;
      s += Math.sin(2 * Math.PI * note * t) * 0.55 * gate;
      const reese = (saw(note * 2 * t) + saw(note * 2 * 1.012 * t) + saw(note * 1.002 * t)) / 3;
      const cutoff = 260 + 640 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t * 0.2));
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
      lpReese += a * (reese - lpReese);
      s += lpReese * 0.55;
    }

    if (section !== 'drop') {
      const root = noteHz(0) * 4;
      let pad = 0;
      for (const ratio of [1, 1.498, 1.189, 2.0]) {
        pad += saw(root * ratio * t) + saw(root * ratio * 1.004 * t + 0.3);
      }
      const swell =
        section === 'buildup' ? 0.3 + 0.7 * pos : 0.5 + 0.5 * Math.sin(2 * Math.PI * t * 0.05);
      const cutoff = 300 + 1200 * swell;
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
      lpPad += a * (pad / 8 - lpPad);
      s += lpPad * 0.35;
      if (section === 'breakdown' && step === 0) {
        s += Math.sin(2 * Math.PI * noteHz(0) * t) * env(tInStep, 0.6) * 0.5;
      }
    }

    if (section === 'buildup') {
      const riser = Math.sin(2 * Math.PI * (200 + 1800 * pos * pos) * t);
      s += riser * 0.08 * pos + rand() * 0.12 * pos * pos;
    }

    out[i] = Math.tanh(s * 1.1);
  }

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = 0.89 / peak;
  for (let i = 0; i < samples; i++) out[i]! *= gain;
  return out;
}

function toWav(mono: Float32Array): Buffer {
  const header = 44;
  const buf = Buffer.alloc(header + mono.length * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + mono.length * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(mono.length * 4, 40);
  for (let i = 0; i < mono.length; i++) {
    const v = Math.round(mono[i]! * 32767);
    buf.writeInt16LE(v, header + i * 4);
    buf.writeInt16LE(v, header + i * 4 + 2);
  }
  return buf;
}
