import { ProfileImport } from './profile-import.tsx';
import { useState } from 'react';
import { MIDI_ACTIONS, type MidiAction } from '@setcast/core';
import type { LiveMidi } from './midi.ts';

type Props = { midi: LiveMidi };
export function MidiControls({ midi }: Props) {
  return (
    <details className="sc-performance-midi">
      <summary>
        MIDI controls
        {midi.selected && !midi.devices.some((device) => device.id === midi.selected)
          ? ' · Disconnected'
          : ''}
      </summary>
      <p className="sc-midi-profile-source">
        {midi.profile.source} · {midi.profile.config.name} · {Object.keys(midi.mapping).length}{' '}
        mappings
      </p>
      <p>
        {midi.profile.sessionOnly
          ? 'Project mappings are loaded at startup. Export session changes to keep them.'
          : 'Changes are saved in this browser. Export a profile to use it on another machine.'}
      </p>
      {!midi.connected && (
        <button
          className="sc-button"
          disabled={midi.connecting}
          onClick={() => void midi.connect()}
        >
          Connect MIDI
        </button>
      )}
      {midi.connected && <MidiMappingControls midi={midi} />}
      {midi.learning && <p role="status">Move or press the controller for {midi.learning}.</p>}
      <MidiTransfer midi={midi} />
      <MidiMappings midi={midi} />
    </details>
  );
}

function MidiMappingControls({ midi }: Props) {
  const [target, setTarget] = useState<MidiAction>('intensity');
  return (
    <div className="sc-performance-timing">
      <label>
        MIDI input
        <select
          aria-label="MIDI input"
          value={midi.selected}
          onChange={(event) => midi.select(event.target.value)}
        >
          <option value="">Choose input</option>
          {midi.devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name ?? device.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Control
        <select
          aria-label="MIDI action"
          value={target}
          onChange={(event) => setTarget(event.target.value as MidiAction)}
        >
          {MIDI_ACTIONS.map((choice) => (
            <option key={choice}>{choice}</option>
          ))}
        </select>
      </label>
      <button
        className="sc-button"
        disabled={!midi.selected}
        onClick={() => midi.learn(midi.learning ? null : target)}
      >
        {midi.learning ? 'Cancel learning' : 'Learn MIDI'}
      </button>
    </div>
  );
}

function MidiTransfer({ midi }: Props) {
  return (
    <div className="sc-performance-timing">
      <button className="sc-button" onClick={midi.profile.download}>
        Export MIDI profile
      </button>
      <ProfileImport label="Import MIDI profile" upload={midi.upload} />
      <button className="sc-button" onClick={midi.reset}>
        Reset MIDI mappings
      </button>
    </div>
  );
}

function MidiMappings({ midi }: Props) {
  const entries = Object.entries(midi.mapping);
  return (
    <details className="sc-midi-mappings">
      <summary>Mapping list · {entries.length}</summary>
      {entries.length ? (
        <div className="sc-midi-mapping-list">
          <table>
            <thead>
              <tr>
                <th>Controller</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, action]) => {
                const [kind, channel, number] = key.split(':');
                return (
                  <tr key={key}>
                    <td>
                      Ch {channel} · {kind === 'cc' ? 'CC' : 'Note'} {number}
                    </td>
                    <td>{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No mapped actions. Import a profile, learn a control or reset the defaults.</p>
      )}
    </details>
  );
}
