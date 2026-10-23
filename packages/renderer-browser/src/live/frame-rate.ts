interface Observation {
  now: number;
  frame: number;
  source: object | null;
  available: boolean;
  hidden: boolean;
}

export class FrameRateSampler {
  private previous: Observation | null = null;
  private started = 0;
  private updates = 0;

  reset() {
    this.previous = null;
    this.updates = 0;
  }

  /** Null resets stale diagnostics; undefined is an incomplete window; a number is a fresh rate. */
  sample(current: Observation): number | null | undefined {
    const previous = this.previous;
    this.previous = current;
    if (
      !previous ||
      current.source !== previous.source ||
      current.available !== previous.available ||
      current.hidden !== previous.hidden ||
      current.now < previous.now
    ) {
      this.started = current.now;
      this.updates = 0;
      return null;
    }
    if (current.frame !== previous.frame) this.updates++;
    const elapsed = current.now - this.started;
    if (elapsed < 1000) return undefined;
    const fps = (this.updates * 1000) / elapsed;
    this.started = current.now;
    this.updates = 0;
    return fps;
  }
}
