import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { formatTime, type ResolvedProject } from '@setcast/core';
import type { ThemeListing } from '../catalog.ts';
import type { Transport } from '../transport.ts';
import { ArtMenu } from './art.tsx';
import { SaveScene } from './save.tsx';
import {
  ArtIcon,
  CheckIcon,
  DockIcon,
  FullscreenIcon,
  KeyboardIcon,
  PauseIcon,
  PlayIcon,
  ThemeIcon,
  VolumeIcon,
} from './icons.tsx';
import type { Art, Credits } from './overrides.ts';
import type { PlaybackSnapshot } from './playback.ts';
import { Scrubber, segmentAt, segmentsOf, type Segment } from './scrubber.tsx';

export interface DockProps {
  dock: RefObject<HTMLElement | null>;
  project: ResolvedProject;
  snapshot: PlaybackSnapshot;
  transport: Transport;
  volume: { level: number; set: (level: number) => void; toggleMute: () => void };
  themes: { listings: ThemeListing[]; loading: string | null; select: (name: string) => void };
  credits: { value: Credits | null; set: (credits: Credits) => void };
  art: { art: Art; setArt: (art: Art) => void; choose: (file: File) => void };
  autoHide: { enabled: boolean; shown: boolean; toggle: () => void };
  fullscreen: { active: boolean; toggle: () => void };
  report: (message: string, failed?: boolean) => void;
}

export function Dock(props: DockProps) {
  const { dock, project, snapshot, transport } = props;
  const segments = useMemo(() => segmentsOf(project.mix), [project.mix]);
  const { shown } = props.autoHide;
  return (
    <footer ref={dock} className="sc-dock" data-shown={shown} inert={!shown}>
      <Scrubber
        mix={project.mix}
        segments={segments}
        time={snapshot.time}
        seek={(seconds) => transport.seek(seconds)}
      />
      <div className="sc-dock-row">
        <div className="sc-dock-transport">
          <PlayButton snapshot={snapshot} transport={transport} />
          <NowPlaying project={project} segments={segments} snapshot={snapshot} />
        </div>
        <div className="sc-dock-tools">
          <CreditsSwitch {...props.credits} />
          <span className="sc-dock-divider" />
          <ThemeMenu current={project.theme} {...props.themes} />
          <Menu id="sc-art-menu" label="Art" icon={<ArtIcon />} title="Change the art">
            <ArtMenu project={project} {...props.art} />
          </Menu>
          <Volume {...props.volume} />
          <SaveScene
            selection={{ theme: project.theme, credits: props.credits.value }}
            art={props.art.art}
            report={props.report}
          />
          <WindowControls {...props} />
        </div>
      </div>
    </footer>
  );
}

function WindowControls(props: DockProps) {
  return (
    <>
      <span className="sc-dock-divider" />
      <IconButton
        label={props.autoHide.enabled ? 'Keep controls shown (H)' : 'Hide controls (H)'}
        pressed={props.autoHide.enabled}
        onClick={props.autoHide.toggle}
      >
        <DockIcon pinned={!props.autoHide.enabled} />
      </IconButton>
      <Menu id="sc-shortcuts" label="Keyboard shortcuts (?)" icon={<KeyboardIcon />}>
        <Shortcuts />
      </Menu>
      <IconButton
        label={props.fullscreen.active ? 'Exit full screen (F)' : 'Full screen (F)'}
        onClick={props.fullscreen.toggle}
      >
        <FullscreenIcon active={props.fullscreen.active} />
      </IconButton>
    </>
  );
}

function PlayButton({ snapshot, transport }: { snapshot: PlaybackSnapshot; transport: Transport }) {
  const preparing = snapshot.playing && snapshot.waiting;
  return (
    <button
      className="sc-play"
      aria-label={snapshot.playing ? 'Pause (Space)' : 'Play (Space)'}
      title={snapshot.playing ? 'Pause (Space)' : 'Play (Space)'}
      data-preparing={preparing}
      disabled={Boolean(snapshot.error)}
      onClick={() => (snapshot.playing ? transport.pause() : transport.play())}
    >
      {snapshot.playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

function NowPlaying({
  project,
  segments,
  snapshot,
}: {
  project: ResolvedProject;
  segments: Segment[];
  snapshot: PlaybackSnapshot;
}) {
  const title = segmentAt(segments, snapshot.time)?.title || project.title;
  return (
    <div className="sc-now">
      <span className="sc-now-time">
        {formatTime(snapshot.time)}
        <span> / {formatTime(project.mix.duration / 1_000_000)}</span>
      </span>
      <span className="sc-now-title" title={title}>
        {snapshot.waiting && snapshot.playing ? 'Preparing…' : title}
      </span>
    </div>
  );
}

const CREDITS: { value: Credits; label: string; description: string }[] = [
  { value: 'panels', label: 'Panels', description: 'Credit each track in a panel' },
  { value: 'tracklist', label: 'Tracklist', description: 'Credit tracks in the tracklist' },
  { value: 'both', label: 'Both', description: 'Show panels and the tracklist' },
];

function CreditsSwitch({ value, set }: { value: Credits | null; set: (credits: Credits) => void }) {
  return (
    <div className="sc-segmented" role="group" aria-label="Credits">
      {CREDITS.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          title={`${option.description} (C)`}
          onClick={() => set(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ThemeMenu({
  current,
  listings,
  loading,
  select,
}: {
  current: string;
  listings: ThemeListing[];
  loading: string | null;
  select: (name: string) => void;
}) {
  const [described, setDescribed] = useState<string | null>(null);
  const shown = loading ?? current;
  return (
    <Menu
      id="sc-theme-menu"
      label={shown}
      icon={<ThemeIcon />}
      title="Change the theme ([ and ])"
      busy={loading !== null}
      wide
    >
      <div className="sc-themes" onPointerLeave={() => setDescribed(null)}>
        {listings.map((listing) => (
          <button
            key={listing.name}
            className="sc-theme"
            aria-current={listing.name === current}
            data-loading={listing.name === loading}
            onClick={() => select(listing.name)}
            onPointerEnter={() => setDescribed(listing.name)}
            onFocus={() => setDescribed(listing.name)}
          >
            <span className="sc-theme-name">{listing.name}</span>
            {listing.project && <span className="sc-theme-badge">project</span>}
            <span className="sc-theme-state">
              {listing.name === loading && <span className="sc-spinner" />}
              {listing.name === current && !loading && <CheckIcon />}
            </span>
          </button>
        ))}
      </div>
      <ThemeDescriptions listings={listings} described={described ?? shown} />
    </Menu>
  );
}

/**
 * Every description sits in the same grid cell and only the described one is visible, so the
 * menu keeps the height of the longest one instead of jumping as the pointer moves.
 */
function ThemeDescriptions({
  listings,
  described,
}: {
  listings: ThemeListing[];
  described: string;
}) {
  return (
    <div className="sc-themes-descriptions">
      {listings.map((listing) => (
        <p key={listing.name} data-shown={listing.name === described}>
          {listing.description ?? 'A theme from your project folder.'}
        </p>
      ))}
    </div>
  );
}

function Volume({
  level,
  set,
  toggleMute,
}: {
  level: number;
  set: (level: number) => void;
  toggleMute: () => void;
}) {
  return (
    <div className="sc-volume" style={{ '--level': level }}>
      <IconButton label={level === 0 ? 'Unmute (M)' : 'Mute (M)'} onClick={toggleMute}>
        <VolumeIcon level={level} />
      </IconButton>
      <input
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={level}
        onChange={(event) => set(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}

function Menu({
  id,
  label,
  icon,
  title,
  busy = false,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  title?: string;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const labelled = title !== undefined;
  return (
    <>
      <button
        className={labelled ? 'sc-tool' : 'sc-icon-button'}
        popoverTarget={id}
        aria-label={labelled ? `${title}: ${label}` : label}
        title={title ?? label}
        data-busy={busy}
        style={{ anchorName: `--${id}` }}
      >
        {icon}
        {labelled && <span className="sc-tool-label">{label}</span>}
      </button>
      <div
        id={id}
        popover="auto"
        className="sc-menu"
        data-wide={wide}
        style={{ positionAnchor: `--${id}` }}
      >
        {children}
      </div>
    </>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="sc-icon-button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Play or pause'],
  [['←', '→'], 'Back or forward 5 seconds'],
  [['Shift', '←', '→'], 'Back or forward 30 seconds'],
  [['[', ']'], 'Previous or next theme'],
  [['C'], 'Next credits layout'],
  [['M'], 'Mute or unmute'],
  [['H'], 'Hide or keep the controls'],
  [['F'], 'Full screen'],
  [['?'], 'Show these shortcuts'],
];

function Shortcuts() {
  return (
    <div className="sc-shortcuts">
      <dl>
        {SHORTCUTS.map(([keys, action]) => (
          <div key={action}>
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p>Point at the bottom edge of the window to bring hidden controls back.</p>
    </div>
  );
}
