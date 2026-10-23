import { BeatRangeSchema, type BeatRange } from '../../packages/core/src/index.ts';

export const PATTERNS = [
  'pulse',
  'four-floor',
  'breaks',
  'offbeat',
  'noise',
  'silence',
  'tone',
  'tempo-change',
  'tempo-continuous',
  'phase-step',
  'missing-beats',
] as const;
export type Pattern = (typeof PATTERNS)[number];
export const METHODS = ['energy', 'bands', 'bass'] as const;
export type Method = (typeof METHODS)[number];
export interface ReferenceGrid {
  from: number;
  until: number;
  bpm: number;
  beatOffset: number;
}
export interface EvaluationCase {
  id: string;
  range: BeatRange;
  at: number;
  seconds: number;
  source: { file: string } | { pattern: Pattern; bpm: number; offset: number; seed: number };
  /** Missing means unlabeled; null explicitly means no reliable grid should be accepted. */
  reference?: ReferenceGrid[] | null;
}
export interface EvaluationConfig {
  version: 1;
  methods: Method[];
  cases: EvaluationCase[];
}

export function parseEvaluation(input: unknown): EvaluationConfig {
  const config = object(input, ['version', 'methods', 'cases'], 'evaluation');
  if (config.version !== 1) throw new Error('Beat evaluation requires version: 1.');
  const methods = config.methods ?? [...METHODS];
  if (
    !Array.isArray(methods) ||
    !methods.length ||
    methods.some((m) => !METHODS.includes(m)) ||
    new Set(methods).size !== methods.length
  )
    throw new Error('methods must list unique energy, bands or bass methods.');
  if (!Array.isArray(config.cases) || config.cases.length < 1 || config.cases.length > 64)
    throw new Error('cases must contain 1–64 evaluation cases.');
  const cases = config.cases.map(parseCase);
  if (new Set(cases.map((entry) => entry.id)).size !== cases.length)
    throw new Error('Case IDs must be unique.');
  return { version: 1, methods, cases };
}

function parseCase(value: unknown): EvaluationCase {
  const entry = object(value, ['id', 'range', 'at', 'seconds', 'source', 'reference'], 'case');
  if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id))
    throw new Error('Case id must be 1–64 lowercase letters, digits or hyphens.');
  const at = number(entry.at ?? 0, 0, 86400, 'at');
  const seconds = number(entry.seconds ?? 24, 12, 7200, 'seconds');
  if (![at, seconds].every((time) => Math.abs(time * 100 - Math.round(time * 100)) < 1e-7))
    throw new Error('at and seconds must align to 10 ms onset hops.');
  const source = parseSource(entry.source);
  const reference = parseReference(entry.reference, at, seconds);
  return {
    id: entry.id,
    range: BeatRangeSchema.parse(entry.range ?? { min: 90, max: 180 }),
    at,
    seconds,
    source,
    reference,
  };
}

function parseSource(value: unknown): EvaluationCase['source'] {
  const source = object(value, ['file', 'pattern', 'bpm', 'offset', 'seed'], 'source');
  if (typeof source.file === 'string' && source.file.trim()) {
    if (Object.keys(source).some((key) => key !== 'file'))
      throw new Error('A file source accepts only file.');
    return { file: source.file };
  }
  if (!PATTERNS.includes(source.pattern as Pattern) || source.file !== undefined)
    throw new Error(`A source requires a file or a synthetic pattern: ${PATTERNS.join(', ')}.`);
  const seed = number(source.seed ?? 1, 0, 0xffffffff, 'seed');
  if (!Number.isInteger(seed)) throw new Error('seed must be a whole unsigned 32-bit value.');
  return {
    pattern: source.pattern as Pattern,
    bpm: number(
      source.bpm ?? 120,
      40,
      String(source.pattern).startsWith('tempo-') ? 220 : 240,
      'bpm',
    ),
    offset: number(source.offset ?? 0.17, 0, 86400, 'offset'),
    seed,
  };
}

function parseReference(value: unknown, at: number, seconds: number): EvaluationCase['reference'] {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value) || !value.length || value.length > 256)
    throw new Error('reference must be null or 1–256 grid intervals. Omit it for unlabeled audio.');
  let previousEnd = at;
  return value.map((item) => {
    const grid = object(item, ['from', 'until', 'bpm', 'beatOffset'], 'reference grid');
    const from = number(grid.from, at, at + seconds, 'reference.from');
    const until = number(grid.until, from, at + seconds, 'reference.until');
    if (until <= from || from < previousEnd)
      throw new Error('Reference intervals must be nonempty, ordered and nonoverlapping.');
    previousEnd = until;
    return {
      from,
      until,
      bpm: number(grid.bpm, 40, 240, 'reference.bpm'),
      beatOffset: number(grid.beatOffset, 0, 172800, 'reference.beatOffset'),
    };
  });
}

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  const extra = Object.keys(result).filter((key) => !keys.includes(key));
  if (extra.length) throw new Error(`Unknown ${label} fields: ${extra.join(', ')}.`);
  return result;
}

function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`${label} must be a finite number from ${min} to ${max}.`);
  return value;
}
