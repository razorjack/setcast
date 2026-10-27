import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/** How close to the bottom edge the pointer brings a hidden dock back, in CSS pixels. */
const EDGE = 12;
/** How far above the dock the pointer may wander before it hides again. */
const SLACK = 48;
const HIDE_DELAY_MS = 500;
const IDLE_CURSOR_MS = 2500;
const STORAGE_KEY = 'setcast.player.autoHide';
/** A mouse click leaves focus on a button; only keyboard focus keeps the dock up. */
const ENGAGED = ':hover, :focus-within:has(:focus-visible), :has(:popover-open)';

/**
 * Pinned, the dock keeps its own space below the scene. With auto-hide, like the macOS Dock, it
 * slides away over the scene and returns while the pointer touches the bottom edge, stays while
 * the pointer, keyboard focus or an open menu is in it, and leaves once the pointer moves away.
 */
export function useAutoHide(dock: RefObject<HTMLElement | null>) {
  const [autoHide, setAutoHide] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [revealed, setRevealed] = useState(false);
  useEdgeReveal(dock, autoHide, setRevealed);
  const idle = useIdle(autoHide && !revealed);

  const toggle = useCallback(() => {
    setAutoHide((enabled) => {
      localStorage.setItem(STORAGE_KEY, String(!enabled));
      return !enabled;
    });
    setRevealed(false);
  }, []);
  const reveal = useCallback(() => setRevealed(true), []);

  return { enabled: autoHide, shown: !autoHide || revealed, idle, toggle, reveal };
}

function useEdgeReveal(
  dock: RefObject<HTMLElement | null>,
  enabled: boolean,
  setRevealed: (revealed: boolean) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const engaged = () => Boolean(dock.current?.matches(ENGAGED));
    const hideSoon = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setRevealed(engaged()), HIDE_DELAY_MS);
    };
    const move = (event: PointerEvent) => {
      const top = dock.current?.getBoundingClientRect().top ?? innerHeight;
      if (event.clientY >= innerHeight - EDGE) {
        clearTimeout(timer);
        setRevealed(true);
      } else if (event.clientY < top - SLACK) hideSoon();
    };
    const focus = () => {
      if (engaged()) setRevealed(true);
    };
    const root = document.documentElement;
    window.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', hideSoon);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hideSoon);
    return () => {
      window.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', hideSoon);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hideSoon);
      clearTimeout(timer);
    };
  }, [dock, enabled, setRevealed]);
}

/** True once the pointer has rested for a while, so the scene can hide the cursor. */
function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const move = () => {
      setIdle(false);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setIdle(true), IDLE_CURSOR_MS);
    };
    move();
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      clearTimeout(timer.current);
    };
  }, [enabled]);
  return enabled && idle;
}
