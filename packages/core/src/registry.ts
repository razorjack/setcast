export class Registry<T extends { name: string }> {
  readonly kind: string;
  readonly #items = new Map<string, T>();

  constructor(kind: string) {
    this.kind = kind;
  }

  add(item: T): T {
    this.#items.set(item.name, item);
    return item;
  }

  has(name: string): boolean {
    return this.#items.has(name);
  }

  get(name: string): T {
    const item = this.#items.get(name);
    if (item) return item;
    throw new Error(
      `Unknown ${this.kind} "${name}". Available: ${this.names().join(', ') || '(none registered)'}.`,
    );
  }

  names(): string[] {
    return [...this.#items.keys()];
  }
}
