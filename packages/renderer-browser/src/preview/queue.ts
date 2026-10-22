/** One render at a time, with only the newest seek retained while a frame is preparing. */
export class PreviewQueue {
  private pending: number | null = null;
  private running = false;
  private stopped = false;
  private render: (frame: number) => Promise<unknown>;
  private ready: (frame: number) => void;
  private fail: (error: unknown) => void;
  constructor(
    render: (frame: number) => Promise<unknown>,
    ready: (frame: number) => void,
    fail: (error: unknown) => void,
  ) {
    this.render = render;
    this.ready = ready;
    this.fail = fail;
  }
  request(frame: number) {
    if (this.stopped) return;
    this.pending = frame;
    if (!this.running) void this.drain();
  }
  close() {
    this.stopped = true;
    this.pending = null;
  }
  private async drain() {
    this.running = true;
    try {
      while (this.pending !== null && !this.stopped) {
        const frame = this.pending;
        this.pending = null;
        await this.render(frame);
        if (!this.stopped && this.pending === null) this.ready(frame);
      }
    } catch (error) {
      this.pending = null;
      if (!this.stopped) this.fail(error);
      this.close();
    } finally {
      this.running = false;
    }
  }
}

export function previewFrame(frame: number, count: number) {
  return Math.min(count - 1, Math.max(0, Number.isFinite(frame) ? Math.floor(frame) : 0));
}
