import type { GpuCanvasConfig } from '../../gpu.ts';
import type { RenderFrame } from '../frame.tsx';
import type { RendererBindings, RendererDiagnostic } from '../renderer.tsx';
import type { Shader } from './ShaderCanvas.tsx';
import { createPainter, type ShaderPainter } from './shader-painter.ts';

interface ShaderSessionOptions<C> {
  current: () => { frame: RenderFrame; config: C; resolution: number };
  hold: RendererBindings['hold'];
  diagnostic: (event: RendererDiagnostic) => void;
  fail: (error: Error) => void;
}

/** Context recovery owns GPU resources and readiness, never the source clock or scene identity. */
export class ShaderSession<C extends GpuCanvasConfig> {
  private canvas: HTMLCanvasElement;
  private shader: Shader<C>;
  private options: ShaderSessionOptions<C>;
  private painter: ShaderPainter<C> | null;
  private phase: 'ready' | 'recovering' | 'failed' | 'disposed' = 'ready';
  private release: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement, shader: Shader<C>, options: ShaderSessionOptions<C>) {
    this.canvas = canvas;
    this.shader = shader;
    this.options = options;
    this.painter = createPainter(canvas, shader);
    canvas.dataset.gpuState = 'ready';
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }

  draw() {
    if (this.phase !== 'ready') return;
    try {
      const { frame, config, resolution } = this.options.current();
      if (!this.painter?.draw(frame, config, resolution)) this.recover();
    } catch (error) {
      this.fail(error);
    }
  }

  private lost = (event: Event) => {
    if (this.options.current().config.recoverySeconds > 0) event.preventDefault();
    this.recover();
  };

  private recover() {
    if (this.phase !== 'ready') return;
    const seconds = this.options.current().config.recoverySeconds;
    this.phase = 'recovering';
    this.canvas.dataset.gpuState = 'recovering';
    this.release = this.options.hold(`gpu:${this.shader.name}:context`);
    this.painter?.dispose();
    this.painter = null;
    if (seconds === 0) {
      this.fail(this.lossError('Recovery is disabled.'));
      return;
    }
    this.timer = setTimeout(
      () => this.fail(this.lossError(`It did not recover within ${seconds} seconds.`)),
      seconds * 1000,
    );
    this.diagnostic({
      level: 'warning',
      source: this.shader.name,
      code: 'gpu-context-lost',
      message: `Visualizer "${this.shader.name}" is waiting for graphics recovery (up to ${seconds}s).`,
    });
  }

  private restored = () => {
    if (this.phase !== 'recovering') return;
    this.clearTimer();
    try {
      this.painter = createPainter(this.canvas, this.shader);
      const { frame, config, resolution } = this.options.current();
      if (!this.painter.draw(frame, config, resolution))
        throw this.lossError('It was lost again while restoring.');
      this.phase = 'ready';
      this.canvas.dataset.gpuState = 'ready';
      this.release?.();
      this.release = null;
      this.diagnostic({
        level: 'info',
        source: this.shader.name,
        code: 'gpu-context-restored',
        message: `Visualizer "${this.shader.name}" recovered its graphics context.`,
      });
    } catch (error) {
      this.fail(error);
    }
  };

  private fail(cause: unknown) {
    if (this.phase === 'failed' || this.phase === 'disposed') return;
    this.clearTimer();
    this.phase = 'failed';
    this.canvas.dataset.gpuState = 'failed';
    // Keep the frame held until React commits the failure and disposes this session.
    this.options.fail(cause instanceof Error ? cause : new Error(String(cause)));
  }

  private lossError(reason: string) {
    return new Error(
      `Visualizer "${this.shader.name}" lost its WebGL context. ${reason} Reload the player or retry the export with fewer capture workers or lower resolution.`,
    );
  }

  private diagnostic(event: RendererDiagnostic) {
    try {
      this.options.diagnostic(event);
    } catch (error) {
      console.warn('Renderer diagnostic handler failed:', error);
    }
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() {
    if (this.phase === 'disposed') return;
    this.phase = 'disposed';
    this.clearTimer();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    this.painter?.dispose();
    this.painter = null;
    this.release?.();
    this.release = null;
  }
}
