export interface ProcessSample {
  pid: number;
  parent: number;
  rssBytes: number;
  cpuSeconds: number;
  started: string;
}

/** BSD uses minutes:seconds.hundredths; procps also emits hours and day prefixes. */
export function cpuSeconds(value: string): number {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) throw new Error(`Unrecognized ps CPU time: ${value}`);
  const [, days, hours, minutes, seconds] = match;
  if (Number(seconds) >= 60 || (hours !== undefined && Number(minutes) >= 60))
    throw new Error(`Invalid ps CPU time: ${value}`);
  const total =
    Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
  if (!Number.isFinite(total)) throw new Error('Nonfinite ps CPU time.');
  return total;
}

export function parseProcesses(text: string): Map<number, ProcessSample> {
  const samples = new Map<number, ProcessSample>();
  for (const line of text.trim().split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (!match) throw new Error('Unrecognized ps process row.');
    const [, pid, parent, rss, time, started] = match;
    const sample = {
      pid: Number(pid),
      parent: Number(parent),
      rssBytes: Number(rss) * 1024,
      cpuSeconds: cpuSeconds(time!),
      started: started!,
    };
    if (![sample.pid, sample.parent, sample.rssBytes].every(Number.isSafeInteger))
      throw new Error('Invalid ps process identifier or RSS.');
    if (samples.has(sample.pid)) throw new Error('Duplicate ps process identifier.');
    samples.set(sample.pid, sample);
  }
  return samples;
}

export function descendants(samples: Map<number, ProcessSample>, root: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const sample of samples.values()) {
    const siblings = children.get(sample.parent) ?? [];
    siblings.push(sample.pid);
    children.set(sample.parent, siblings);
  }
  const tree = new Set<number>();
  const pending = [root];
  while (pending.length) {
    const pid = pending.pop()!;
    if (tree.has(pid)) continue;
    tree.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return tree;
}

export function processDelta(
  before: Map<number, ProcessSample>,
  after: Map<number, ProcessSample>,
  root: number,
) {
  const previousTree = descendants(before, root);
  const currentTree = descendants(after, root);
  let treeCpuSeconds = 0,
    externalCpuSeconds = 0,
    rssBytes = 0;
  for (const sample of after.values()) {
    if (currentTree.has(sample.pid)) rssBytes += sample.rssBytes;
    const previous = before.get(sample.pid);
    if (!previous || previous.started !== sample.started) continue;
    const delta = sample.cpuSeconds - previous.cpuSeconds;
    if (delta < 0) continue;
    if (previousTree.has(sample.pid) || currentTree.has(sample.pid)) treeCpuSeconds += delta;
    else externalCpuSeconds += delta;
  }
  return { treeCpuSeconds, externalCpuSeconds, rssBytes };
}
