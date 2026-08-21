import { expect, test } from 'vite-plus/test';
import { DeckSchema } from './events.ts';

test('decks are limited to A through D', () => {
  for (const deck of ['A', 'B', 'C', 'D']) expect(DeckSchema.safeParse(deck).success).toBe(true);
  for (const deck of ['E', 'Z', 'a', 'AB']) expect(DeckSchema.safeParse(deck).success).toBe(false);
});
