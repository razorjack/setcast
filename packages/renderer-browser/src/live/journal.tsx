import { useEffect, useState } from 'react';
import {
  rampAt,
  type PerformanceEvent,
  type SceneSelection,
  type SessionEvent,
} from '@setcast/core';
import type { Art } from '../browser/overrides.ts';
import { playerWrite, uploadArt } from '../browser/save.tsx';
import type { LiveInput } from './input.ts';
import type { Report } from '../browser/report.ts';

interface JournalProps {
  input: LiveInput;
  performance?: () => PerformanceEvent;
  selection: Omit<SceneSelection, 'art'>;
  art: Art;
  report: Report;
}

export function SessionJournal({
  journal,
  running,
}: {
  journal: JournalRecorder;
  running: boolean;
}) {
  return (
    <details className="sc-live-journal">
      <summary>Session journal{journal.active ? ' · Recording events' : ''}</summary>
      <p>
        Records credits, cues, announcements and scene settings. Record mixer audio separately.
        Starting a new input ends this journal.
      </p>
      <button
        className="sc-button"
        disabled={journal.starting || (!journal.active && (!running || journal.pending > 0))}
        onClick={() => void (journal.active ? journal.stop() : journal.start())}
      >
        {journal.active ? 'Finish journal' : 'Start journal'}
      </button>
      {journal.file && <p>Saved to {journal.file}</p>}
      <JournalEntries journal={journal} />
    </details>
  );
}

function JournalEntries({ journal }: { journal: JournalRecorder }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  return (
    <fieldset disabled={!journal.active}>
      <label>
        Artist
        <input value={artist} onChange={(event) => setArtist(event.target.value)} />
      </label>
      <label>
        Track title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button
        className="sc-button"
        disabled={!title.trim()}
        onClick={() =>
          journal.event({ type: 'credit', sample: journal.sample(), title: title.trim(), artist })
        }
      >
        Log track now
      </button>
      <div>
        {(['drop', 'breakdown', 'buildup', 'rewind', 'section_end'] as const).map((kind) => (
          <button
            className="sc-button"
            key={kind}
            onClick={() => journal.event({ type: 'cue', sample: journal.sample(), kind })}
          >
            {kind.replace('_', ' ')}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export class JournalRecorder {
  file: string | null = null;
  active = false;
  starting = false;
  pending = 0;
  failed = false;
  audio: LiveInput['capture']['audio'] = null;
  origin = 0;
  queue = Promise.resolve();
  props: JournalProps;
  changed: () => void;
  constructor(props: JournalProps, changed: () => void) {
    this.props = props;
    this.changed = changed;
  }
  sample = () =>
    Math.max(
      0,
      Math.round((this.audio?.capturedTime ?? 0) * (this.audio?.sampleRate ?? 1)) - this.origin,
    );
  start = async () => {
    const audio = this.props.input.capture.audio;
    if (!audio || this.starting || this.active || this.pending > 0) return;
    this.starting = true;
    this.changed();
    try {
      this.origin = Math.round(audio.capturedTime * audio.sampleRate);
      const saved = await playerWrite(
        '/journal/start',
        JSON.stringify({
          type: 'session',
          version: 1,
          sampleRate: audio.sampleRate,
          captureId: crypto.randomUUID(),
          originSample: this.origin,
          startedAt: new Date().toISOString(),
        }),
      );
      this.audio = audio;
      this.file = saved.journal;
      this.queue = Promise.resolve();
      this.failed = false;
      this.active = true;
      this.scene(this.props.selection, this.props.art, 0);
      this.initialPerformance();
      if (audio !== this.props.input.capture.audio) this.stop();
    } catch (error) {
      this.props.report(String(error));
    } finally {
      this.starting = false;
      this.changed();
    }
  };
  initialPerformance() {
    const ramp = this.props.performance?.();
    if (!ramp || !this.audio) return;
    const now = this.origin / this.audio.sampleRate;
    this.event({
      type: 'performance',
      sample: 0,
      from: rampAt(ramp, now),
      to: ramp.to,
      duration: Math.max(0, ramp.at + ramp.duration - now),
    });
  }
  performance = (ramp: PerformanceEvent) => {
    if (!this.audio) return;
    const sample = Math.max(0, Math.round(ramp.at * this.audio.sampleRate) - this.origin);
    this.event({
      type: 'performance',
      sample,
      from: ramp.from,
      to: ramp.to,
      duration: ramp.duration,
    });
  };
  enqueue(task: () => Promise<void>) {
    if (this.pending >= 32) {
      this.active = false;
      this.props.report(
        'Journal stopped because scene saves fell behind. Wait for pending writes before starting another.',
      );
      this.changed();
      return;
    }
    this.pending++;
    this.queue = this.queue
      .then(task)
      .catch((error: unknown) => {
        this.active = false;
        if (!this.failed)
          this.props.report(`Journal stopped: ${String(error)}. Saved lines remain available.`);
        this.failed = true;
        throw error;
      })
      .finally(() => {
        this.pending--;
        this.changed();
      });
    void this.queue.catch(() => {});
  }
  event = (event: SessionEvent) => {
    if (!this.active) return;
    const journal = this.file;
    this.enqueue(async () => {
      await playerWrite('/journal/append', JSON.stringify({ journal, event }));
    });
  };
  stop = () => {
    this.event({ type: 'end', sample: this.sample() });
    this.active = false;
    this.changed();
  };
  scene(selection: JournalProps['selection'], art: Art, sample = this.sample()) {
    if (!this.active) return;
    const journal = this.file;
    const uploading = uploadArt(art);
    this.enqueue(async () => {
      const artwork = await uploading;
      const saved = await playerWrite(
        '/journal/scene',
        JSON.stringify({ ...selection, art: art.kind, artwork }),
      );
      await playerWrite(
        '/journal/append',
        JSON.stringify({ journal, event: { type: 'scene', sample, preset: saved.directory } }),
      );
    });
  }
}

export function useSessionJournal(props: JournalProps) {
  const [, revise] = useState(0);
  const [journal] = useState(
    () => new JournalRecorder(props, () => revise((revision) => revision + 1)),
  );
  journal.props = props;
  const selection = JSON.stringify(props.selection);
  const art = props.art;
  useEffect(() => {
    journal.scene(JSON.parse(selection), art);
  }, [journal, selection, art]);
  const audio = props.input.capture.audio;
  useEffect(() => {
    if (journal.active && journal.audio !== audio) journal.stop();
  }, [journal, audio]);
  return journal;
}
