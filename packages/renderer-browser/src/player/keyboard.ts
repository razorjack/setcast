import { useEffect, useRef } from 'react';

export type Shortcuts = Record<string, (event: KeyboardEvent) => void>;

/** Keys a focused control handles itself, such as Space on a button or arrows on a slider. */
const CONTROL_KEYS = new Set([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Letters match either case; modified keys are left to the browser. */
export function useShortcuts(shortcuts: Shortcuts) {
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.matches(
          'textarea, input:not([type="range"]):not([type="checkbox"]):not([type="file"]):not([type="button"])',
        )
      )
        return;
      if (CONTROL_KEYS.has(event.key) && target.matches('input, button, select, textarea')) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const action = latest.current[key];
      if (!action) return;
      event.preventDefault();
      action(event);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
