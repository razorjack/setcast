import { useState } from 'react';
import { BrandingSchema, type Branding, type BrandPosition } from '@setcast/core';
import type { Report } from '../player/report.ts';

/** What the operator edits. An empty text field removes that line. */
export interface BrandingEdit {
  name?: string;
  event?: string;
  episode?: string;
  position?: BrandPosition;
  size?: number;
}

/**
 * The branding after an operator edit, validated by the same schema as live.yaml. Without any
 * branding, an edit that adds text starts from the defaults.
 */
export function editBranding(current: Branding | null, edit: BrandingEdit): Branding | null {
  const next: Record<string, unknown> = { ...current, ...edit };
  for (const key of ['name', 'event', 'episode'] as const) {
    if (typeof next[key] === 'string' && !next[key].trim()) delete next[key];
  }
  if (!current && !next.name && !next.event && !next.episode) return null;
  const parsed = BrandingSchema.safeParse(next);
  if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
  return parsed.data;
}

/** Shows or hides the identity block, or the rotating messages, keeping their settings. */
export function toggleBranding(
  current: Branding | null,
  part: 'visible' | 'messages',
): Branding | null {
  if (!current) return null;
  if (part === 'visible') return { ...current, visible: !current.visible };
  if (!current.messages) return current;
  return { ...current, messages: { ...current.messages, visible: !current.messages.visible } };
}

export function useLiveBranding(initial: Branding | null, report: Report) {
  const [value, set] = useState(initial);
  return {
    value,
    set,
    edit: (edit: BrandingEdit) => {
      try {
        set(editBranding(value, edit));
      } catch (error) {
        report(`Cannot apply branding: ${(error as Error).message}`);
      }
    },
    toggle: (part: 'visible' | 'messages') => set((current) => toggleBranding(current, part)),
  };
}

export type LiveBranding = ReturnType<typeof useLiveBranding>;
