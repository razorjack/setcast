import { useState } from 'react';
import { BRAND_POSITIONS, type Branding } from '@setcast/core';
import type { LiveAnnouncements } from './announcements.ts';
import type { LiveBranding } from './branding.ts';

const SIZES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const DURATIONS = [5, 10, 20, 30, 60];

export function BrandingControls({
  branding,
  announcements,
}: {
  branding: LiveBranding;
  announcements: LiveAnnouncements;
}) {
  const value = branding.value;
  return (
    <details className="sc-live-branding">
      <summary>
        Branding{announcements.showing ? ' · Announcement on screen' : ''}
        {value && !value.visible ? ' · Identity hidden' : ''}
      </summary>
      <p>
        Logo and messages come from live.yaml. Changes apply to this scene; saved scenes and the
        journal keep them.
      </p>
      <BrandingVisibility branding={branding} />
      <IdentityFields key={identityKey(value)} branding={branding} />
      <Announcement announcements={announcements} />
    </details>
  );
}

function BrandingVisibility({ branding }: { branding: LiveBranding }) {
  const value = branding.value;
  return (
    <div className="sc-live-branding-visibility">
      <label className="sc-live-check">
        <input
          type="checkbox"
          disabled={!value}
          checked={value?.visible ?? false}
          onChange={() => branding.toggle('visible')}
        />
        Show identity
      </label>
      <label className="sc-live-check">
        <input
          type="checkbox"
          disabled={!value?.messages?.lines.length}
          checked={value?.messages?.visible ?? false}
          onChange={() => branding.toggle('messages')}
        />
        Show messages
      </label>
      <BrandingLayout branding={branding} />
    </div>
  );
}

function BrandingLayout({ branding }: { branding: LiveBranding }) {
  const value = branding.value;
  return (
    <>
      <label>
        Position
        <select
          aria-label="Branding position"
          disabled={!value}
          value={value?.position ?? 'top-right'}
          onChange={(event) =>
            branding.edit({ position: event.target.value as Branding['position'] })
          }
        >
          {BRAND_POSITIONS.map((position) => (
            <option key={position}>{position}</option>
          ))}
        </select>
      </label>
      <label>
        Size
        <select
          aria-label="Branding size"
          disabled={!value}
          value={value?.size ?? 1}
          onChange={(event) => branding.edit({ size: Number(event.target.value) })}
        >
          {sizeChoices(value?.size).map((size) => (
            <option key={size} value={size}>
              {size}×
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Text applies with one button, so the audience never sees a name being typed. */
function IdentityFields({ branding }: { branding: LiveBranding }) {
  const value = branding.value;
  const [name, setName] = useState(value?.name ?? '');
  const [event, setEvent] = useState(value?.event ?? '');
  const [episode, setEpisode] = useState(value?.episode ?? '');
  const changed =
    name !== (value?.name ?? '') ||
    event !== (value?.event ?? '') ||
    episode !== (value?.episode ?? '');
  return (
    <form
      className="sc-live-branding-identity"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        branding.edit({ name, event, episode });
      }}
    >
      <label>
        Name
        <input aria-label="Branding name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Event
        <input
          aria-label="Branding event"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        />
      </label>
      <label>
        Episode
        <input
          aria-label="Branding episode"
          value={episode}
          onChange={(e) => setEpisode(e.target.value)}
        />
      </label>
      <button className="sc-button" type="submit" disabled={!changed}>
        Apply identity
      </button>
    </form>
  );
}

function Announcement({ announcements }: { announcements: LiveAnnouncements }) {
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(10);
  return (
    <form
      className="sc-live-branding-announcement"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        announcements.announce(text.trim(), seconds);
      }}
    >
      <label>
        Announcement
        <input
          aria-label="Announcement text"
          maxLength={200}
          placeholder="Last track"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <DurationSelect seconds={seconds} setSeconds={setSeconds} />
      <button className="sc-button" type="submit" disabled={!announcements.running || !text.trim()}>
        Announce
      </button>
      <button
        className="sc-button"
        type="button"
        disabled={!announcements.showing}
        onClick={announcements.clear}
      >
        Clear announcement
      </button>
    </form>
  );
}

function DurationSelect({
  seconds,
  setSeconds,
}: {
  seconds: number;
  setSeconds: (seconds: number) => void;
}) {
  return (
    <label>
      Seconds
      <select
        aria-label="Announcement seconds"
        value={seconds}
        onChange={(event) => setSeconds(Number(event.target.value))}
      >
        {DURATIONS.map((duration) => (
          <option key={duration}>{duration}</option>
        ))}
      </select>
    </label>
  );
}

/** Recalling a scene replaces the fields' starting values. */
const identityKey = (value: Branding | null) =>
  [value?.name, value?.event, value?.episode].join('\u0000');

const sizeChoices = (current: number | undefined) =>
  current === undefined || SIZES.includes(current)
    ? SIZES
    : [...SIZES, current].toSorted((a, b) => a - b);
