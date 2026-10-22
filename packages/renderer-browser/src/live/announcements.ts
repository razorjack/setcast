import { useEffect, useState } from 'react';
import { endAnnouncement, messageAt, type Announcement } from '@setcast/core';
import type { LiveInput } from './input.ts';
import type { useSessionJournal } from './journal.tsx';

/**
 * The session's announcements on the capture clock, like performance ramps. Only the latest
 * matters, because a new one replaces it. A new capture starts its clock again, so it clears them.
 */
export function useAnnouncements(
  input: LiveInput,
  journal: Pick<ReturnType<typeof useSessionJournal>, 'event' | 'sample'>,
) {
  const [list, setList] = useState<Announcement[]>([]);
  const audio = input.capture.audio;
  useEffect(() => setList([]), [audio]);
  const now = () => audio?.capturedTime ?? 0;
  return {
    list,
    running: input.snapshot.status.phase === 'running',
    announce: (text: string, seconds: number) => {
      setList([{ at: now(), text, seconds }]);
      journal.event({ type: 'announcement', sample: journal.sample(), text, seconds });
    },
    clear: () => {
      setList((current) => endAnnouncement(current, now()));
      journal.event({ type: 'announcement_end', sample: journal.sample() });
    },
    showing: messageAt(null, list, now()) !== null,
  };
}

export type LiveAnnouncements = ReturnType<typeof useAnnouncements>;
