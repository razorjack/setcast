import { useEffect, useRef, useState } from 'react';
import { clamp } from '@setcast/core';

const STORAGE_KEY = 'setcast.player.volume';

/** The audio element's volume, kept across reloads; muting remembers the level to return to. */
export function useVolume(audio: HTMLAudioElement) {
  const [level, setLevel] = useState(() => storedLevel());
  const unmuted = useRef(level || 1);
  useEffect(() => {
    audio.volume = level;
    localStorage.setItem(STORAGE_KEY, String(level));
  }, [audio, level]);

  const set = (next: number) => {
    if (next > 0) unmuted.current = next;
    setLevel(next);
  };
  const toggleMute = () => setLevel(level > 0 ? 0 : unmuted.current);
  return { level, set, toggleMute };
}

function storedLevel() {
  const stored = Number(localStorage.getItem(STORAGE_KEY) ?? 1);
  return Number.isFinite(stored) ? clamp(stored, 0, 1) : 1;
}
