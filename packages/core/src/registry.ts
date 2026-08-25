import { SetcastError } from './errors.ts';

export class Registry<T extends { name: string }> {
  readonly kind: string;
  readonly #items = new Map<string, T>();

  constructor(kind: string) {
    this.kind = kind;
  }

  /** Registers a new item; a second item with the same name is an error, never a silent swap. */
  add(item: T): T {
    if (this.#items.has(item.name)) {
      throw new SetcastError(
        `${this.kind} "${item.name}" is already registered`,
        `Pick another name. Registered ${this.kind}s: ${this.names().join(', ')}.`,
      );
    }
    return this.replace(item);
  }

  /** Swaps in a new item under a name that is already registered. */
  replace(item: T): T {
    this.#items.set(item.name, item);
    return item;
  }

  has(name: string): boolean {
    return this.#items.has(name);
  }

  get(name: string): T {
    const item = this.#items.get(name);
    if (item) return item;
    throw new SetcastError(
      `Unknown ${this.kind} "${name}"`,
      `Available ${this.kind}s: ${this.names().join(', ') || '(none registered)'}.`,
    );
  }

  names(): string[] {
    return [...this.#items.keys()];
  }
}
