/** Holds only a scene replacement. Audio capture and its clock never wait for visual assets. */
export class LiveReadiness {
  private readonly pending = new Set<symbol>();
  revision = 0;

  get ready() {
    return this.pending.size === 0;
  }

  hold = (_label: string) => {
    const token = Symbol();
    this.pending.add(token);
    this.revision++;
    return () => {
      if (this.pending.delete(token)) this.revision++;
    };
  };
}
