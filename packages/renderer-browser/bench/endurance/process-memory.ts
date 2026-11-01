import { execFileSync } from 'node:child_process';
import {
  parseProcesses,
  processDelta,
} from '../../../../scripts/render-compare/process-snapshot.ts';

const scope =
  'Node and current descendants; summed RSS can double-count shared pages. External GPU/encoder services and processes that exit between samples are excluded.';

export function sampleProcessMemory() {
  try {
    if (!['darwin', 'linux'].includes(process.platform))
      throw new Error('Process memory sampling supports macOS and Linux.');
    const rows = parseProcesses(
      execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,time=,lstart='], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C' },
        timeout: 2000,
        maxBuffer: 4 * 1024 * 1024,
      }),
    );
    if (!rows.has(process.pid)) throw new Error('ps omitted the endurance process.');
    return {
      status: 'available',
      rssBytes: processDelta(new Map(), rows, process.pid).rssBytes,
      scope,
    };
  } catch (error) {
    return { status: 'unavailable', error: String(error), scope };
  }
}
