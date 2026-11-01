import { availableParallelism, totalmem } from 'node:os';

const MIB = 1024 * 1024;

export interface CaptureResources {
  cpuCount: number;
  memoryBytes: number;
}

export function captureResources(): CaptureResources {
  const constrained = process.constrainedMemory();
  return {
    cpuCount: availableParallelism(),
    memoryBytes: constrained > 0 ? Math.min(totalmem(), constrained) : totalmem(),
  };
}

export interface CaptureSchedule {
  workers: number;
  reason: 'explicit' | 'short-export' | 'resource-budget';
  cpuCount: number;
  memoryBudgetBytes: number;
  estimatedMemoryBytes: number;
}

/** Stable host limits keep cache/checkpoint identities independent of transient system load. */
export function captureSchedule(
  request: { width: number; height: number; frames: number; concurrency?: number },
  resources: CaptureResources,
): CaptureSchedule {
  const memoryBudgetBytes = Math.floor(resources.memoryBytes / 4);
  // Browser/encoder overhead plus each page's DOM, PCM, decoder and multiple raster buffers.
  // This is an estimate for selection, not a hard limit on native or GPU allocations.
  const fixedBytes = 512 * MIB;
  const workerBytes = 512 * MIB + request.width * request.height * 48;
  const cpuLimit = Math.max(1, Math.floor(resources.cpuCount / 2));
  const memoryLimit = Math.max(1, Math.floor((memoryBudgetBytes - fixedBytes) / workerBytes));
  let workers = 1;
  let reason: CaptureSchedule['reason'] = 'short-export';
  if (request.concurrency !== undefined) {
    workers = request.concurrency;
    reason = 'explicit';
  } else if (request.frames >= 300) {
    workers = [4, 2, 1].find((count) => count <= cpuLimit && count <= memoryLimit)!;
    reason = 'resource-budget';
  }
  workers = Math.min(workers, request.frames);
  return {
    workers,
    reason,
    cpuCount: resources.cpuCount,
    memoryBudgetBytes,
    estimatedMemoryBytes: fixedBytes + workers * workerBytes,
  };
}
