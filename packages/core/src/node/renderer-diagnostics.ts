import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { errorMessage, SetcastError } from '../errors.ts';
import {
  diagnosticOptions,
  rendererReadiness,
  type DiagnosticSettings,
  type RendererCheck,
  type RendererDiagnosticOptions,
  type RendererDiagnosticReport,
} from '../diagnostics/renderer-diagnostics.ts';
import type {
  RendererCapabilities,
  RendererFeature,
} from '../diagnostics/renderer-capabilities.ts';

export type DiagnosticEvidence = Pick<RendererCheck, 'message' | 'details'>;
export type DiagnosticCommand = (binary: 'ffmpeg' | 'ffprobe', args: string[]) => Promise<string>;

/** Adapter helper: records each probe independently so one missing tool does not hide the rest. */
export class RendererDiagnostics {
  readonly capabilities: RendererCapabilities;
  readonly checks: RendererCheck[] = [];
  readonly options: DiagnosticSettings;
  constructor(capabilities: RendererCapabilities, options: RendererDiagnosticOptions = {}) {
    this.capabilities = capabilities;
    this.options = diagnosticOptions(options);
    if (!capabilities.graphicsBackends.includes(this.options.gl))
      throw new SetcastError(
        `Renderer ${capabilities.renderer} does not support gl: ${this.options.gl}.`,
        `Choose ${capabilities.graphicsBackends.join(', ')}.`,
      );
  }

  async check(
    id: string,
    features: readonly RendererFeature[],
    hint: string,
    probe: () => Promise<DiagnosticEvidence>,
  ): Promise<boolean> {
    this.options.signal?.throwIfAborted();
    try {
      const evidence = await probe();
      this.options.signal?.throwIfAborted();
      this.checks.push({ id, features, status: 'pass', ...evidence });
      return true;
    } catch (error) {
      this.options.signal?.throwIfAborted();
      this.checks.push({
        id,
        features,
        status: 'fail',
        hint,
        message: errorMessage(error).slice(0, 4096),
      });
      return false;
    }
  }

  skip(id: string, features: readonly RendererFeature[], message: string) {
    this.checks.push({ id, features, status: 'skipped', message });
  }

  report(): RendererDiagnosticReport {
    const features = rendererReadiness(this.capabilities, this.checks);
    const ready = this.options.require.every((feature) => features[feature] === 'ready');
    return {
      version: 1,
      capabilities: this.capabilities,
      environment: { platform: process.platform, arch: process.arch, node: process.version },
      graphicsBackend: this.options.gl,
      required: this.options.require,
      checks: this.checks,
      features,
      ready,
      exitCode: ready ? 0 : 1,
    };
  }
}

const execute = promisify(execFile);

/** Bounded output, no shell, and a hard kill on timeout to avoid retaining a stuck encoder. */
export async function diagnosticCommand(
  binary: string,
  args: string[],
  options: RendererDiagnosticOptions,
  cwd?: string,
): Promise<string> {
  const result = await execute(binary, args, {
    cwd,
    signal: options.signal,
    timeout: options.timeoutMs ?? 15_000,
    killSignal: 'SIGKILL',
    maxBuffer: 128 * 1024,
  });
  return result.stdout;
}
