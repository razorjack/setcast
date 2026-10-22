import { useState } from 'react';
import { formatTime, type PerformanceState, type ResolvedLiveProject } from '@setcast/core';
import { ArtMenu, type useArt } from '../browser/art.tsx';
import type { useThemes } from '../browser/themes.ts';
import { SaveScene } from '../browser/save.tsx';
import { useInputDevices, type LiveInput } from './input.ts';

interface DockProps {
  performance?: PerformanceState;
  preset?: string | null;
  input: LiveInput;
  themes: ReturnType<typeof useThemes<ResolvedLiveProject>>;
  art: ReturnType<typeof useArt>;
  project: ResolvedLiveProject;
  title: string;
  setTitle: (title: string) => void;
  clock: boolean;
  setClock: (clock: boolean) => void;
  report: (message: string) => void;
  fullscreen: () => void;
  clean: () => void;
}

export function LiveDock(props: DockProps) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section className="sc-live-dock" aria-label="Live controls">
      <LiveToolbar {...props} expanded={expanded} toggle={() => setExpanded(!expanded)} />
      {expanded && (
        <div className="sc-live-settings">
          <InputControls input={props.input} report={props.report} />
          <AppearanceControls {...props} />
        </div>
      )}
      <InputStatus input={props.input} />
    </section>
  );
}

function LiveToolbar(props: DockProps & { expanded: boolean; toggle: () => void }) {
  const status = props.input.snapshot.status;
  const running = status.phase === 'running';
  const busy = status.phase === 'starting';
  let action = 'Start input';
  if (running) action = 'Stop input';
  if (busy) action = 'Cancel';
  return (
    <div className="sc-live-toolbar">
      <div className="sc-live-brand">
        <strong>SETCAST</strong>
        <span data-active={running}>LIVE INPUT</span>
      </div>
      <span className="sc-live-status" role="status">
        {running
          ? `${status.device} · ${formatTime(props.input.snapshot.frame / props.project.fps)}`
          : 'Choose an input to begin'}
      </span>
      <button
        className="sc-button sc-button-primary"
        onClick={() =>
          running || busy
            ? props.input.capture.stop()
            : void props.input.capture.start(props.input.settings)
        }
      >
        {action}
      </button>
      <button className="sc-button" onClick={props.toggle} aria-expanded={props.expanded}>
        Settings
      </button>
      <SaveLiveScene {...props} />
      <button
        className="sc-button"
        onClick={props.clean}
        title="Hide every control. Press H to return."
      >
        Clean output <kbd>H</kbd>
      </button>
      <button className="sc-button" onClick={props.fullscreen}>
        Fullscreen <kbd>F</kbd>
      </button>
    </div>
  );
}

function SaveLiveScene(props: DockProps) {
  const selection = {
    theme: props.project.theme,
    preset: props.preset ?? undefined,
    performance: props.performance,
    title: props.title,
    branding: props.project.branding,
    clock: props.clock,
    input: props.input.settings,
    bpm: props.project.bpm,
    beatOffset: props.project.beatOffset,
  };
  return <SaveScene selection={selection} art={props.art.art} report={props.report} />;
}

function InputControls({ input, report }: Pick<DockProps, 'input' | 'report'>) {
  const { devices, refresh } = useInputDevices(report, input.snapshot.status.phase);
  const { settings, snapshot } = input;
  const selected = settings.device ?? '';
  const change = (next: typeof settings) => {
    try {
      input.configure(next);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="sc-live-input">
      <div className="sc-live-heading">
        <h2>Audio input</h2>
        <button className="sc-button" onClick={() => void refresh()}>
          Refresh devices
        </button>
      </div>
      <label>
        Device
        <select
          value={selected}
          disabled={snapshot.status.phase === 'starting'}
          onChange={(event) =>
            change({ ...settings, device: event.target.value || undefined, channels: null })
          }
        >
          <option value="">System default input</option>
          {selected && !devices.some((device) => device.deviceId === selected) && (
            <option value={selected}>{selected}</option>
          )}
          {devices
            .filter((device) => device.deviceId)
            .map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Audio input ${index + 1}`}
              </option>
            ))}
        </select>
      </label>
      <ChannelControls input={input} change={change} />
      <InputSensitivity settings={settings} change={change} />
    </div>
  );
}

function InputSensitivity({
  settings,
  change,
}: {
  settings: LiveInput['settings'];
  change: (settings: LiveInput['settings']) => void;
}) {
  return (
    <div className="sc-live-sliders">
      <label>
        Sensitivity <output>{settings.gain.toFixed(1)}×</output>
        <input
          aria-label="Sensitivity"
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={settings.gain}
          onChange={(event) => change({ ...settings, gain: Number(event.target.value) })}
        />
      </label>
      <label>
        Visual delay <output>{Math.round(settings.delay * 1000)} ms</output>
        <input
          aria-label="Visual delay"
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={settings.delay}
          onChange={(event) => change({ ...settings, delay: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function ChannelControls({
  input,
  change,
}: {
  input: LiveInput;
  change: (settings: LiveInput['settings']) => void;
}) {
  const {
    settings,
    snapshot: { status },
  } = input;
  const selected = settings.channels ?? status.selected ?? [1, 2];
  const count = Math.max(status.channels, ...selected);
  return (
    <>
      <div className="sc-live-channels">
        {(['Left', 'Right'] as const).map((side, index) => (
          <label key={side}>
            {side} channel
            <select
              aria-label={`${side} channel`}
              value={selected[index]}
              disabled={status.channels === 0 || status.phase === 'starting'}
              onChange={(event) => {
                const channels: [number, number] = [selected[0]!, selected[1]!];
                channels[index] = Number(event.target.value);
                change({ ...settings, channels });
              }}
            >
              {Array.from({ length: count }, (_, channel) => (
                <option key={channel} value={channel + 1} disabled={channel >= status.channels}>
                  Input {channel + 1}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <InputMeters peaks={status.peaks} />
    </>
  );
}

function InputMeters({ peaks }: { peaks: number[] }) {
  return (
    <div className="sc-live-input-meters" aria-label="Exposed input levels">
      {peaks.map((peak, index) => (
        <div
          className="sc-live-input-meter"
          data-clipping={peak >= 0.99}
          key={index}
          title={`Input ${index + 1}: ${peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '−∞'} dBFS`}
        >
          <span>{index + 1}</span>
          <meter aria-label={`Input ${index + 1} level`} min="0" max="1" value={peak} />
        </div>
      ))}
    </div>
  );
}

function AppearanceControls(props: DockProps) {
  const { themes, art } = props;
  return (
    <div className="sc-live-appearance">
      <h2>Scene</h2>
      <div className="sc-live-scene-fields">
        <label>
          Theme
          <select
            aria-label="Theme"
            value={themes.loading ?? themes.project.theme}
            onChange={(event) => themes.select(event.target.value)}
          >
            {themes.listings.map((theme) => (
              <option key={theme.name} value={theme.name}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            aria-label="Title"
            type="text"
            placeholder="Optional"
            value={props.title}
            onChange={(event) => props.setTitle(event.target.value)}
          />
        </label>
        <label className="sc-live-check">
          <input
            type="checkbox"
            checked={props.clock}
            onChange={(event) => props.setClock(event.target.checked)}
          />
          Elapsed clock
        </label>
      </div>
      <details className="sc-live-art">
        <summary>Background artwork</summary>
        <ArtMenu project={props.project} {...art} />
      </details>
    </div>
  );
}

function InputStatus({ input }: { input: LiveInput }) {
  const { status } = input.snapshot;
  let detail = 'Start input to allow device access. No audio is played through your speakers.';
  if (status.phase === 'starting')
    detail = 'Waiting for audio input. Allow access in the browser prompt.';
  if (status.phase === 'running') {
    detail = `${status.channels} exposed channel(s) · ${status.sampleRate / 1000} kHz · Audio monitoring off`;
    if (status.dropped)
      detail += ` · ${(status.dropped / status.sampleRate).toFixed(2)} s of analysis skipped`;
  }
  return (
    <div className="sc-live-footnote">
      <span role={status.message ? 'alert' : 'status'}>{status.message ?? detail}</span>
      <span>OBS: capture the output window; add mixer audio separately.</span>
    </div>
  );
}
