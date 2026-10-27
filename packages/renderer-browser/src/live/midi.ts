import { useEffect, useRef, useState } from 'react';

import {
  errorMessage,
  midiMessage,
  midiKey,
  learnMidiMapping,
  MidiControlBuffer,
  type MidiAction,
  type MidiMapping,
  type MidiConfig,
} from '@setcast/core';
import { useMidiProfile } from './midi-profile.ts';
import type { Report } from '../player/report.ts';
export { midiMessage, midiKey, type MidiAction } from '@setcast/core';

export function useMidi(
  dispatch: (action: MidiAction, value: number) => void,
  report: Report,
  initial?: MidiConfig,
) {
  const connection = useMidiConnection(report);
  const [selected, select] = useState('');
  const profile = useMidiProfile(initial, report);
  const mapping = profile.config.mapping;
  const [learning, learn] = useState<MidiAction | null>(null);
  const latest = useRef({ dispatch, mapping, learning });
  latest.current = { dispatch, mapping, learning };
  useMidiInput(
    connection.devices.find((device) => device.id === selected),
    latest,
    (key, action) => {
      try {
        const mapping = learnMidiMapping(latest.current.mapping, key, action);
        profile.setMapping(() => mapping);
      } catch (error) {
        report(`Cannot learn MIDI mapping: ${errorMessage(error)}`);
      }
      learn(null);
    },
  );
  return {
    ...connection,
    selected,
    select,
    mapping,
    learning,
    learn,
    profile,
    reset: () => {
      profile.reset();
      learn(null);
    },
    upload: async (file: File) => {
      if (await profile.upload(file)) learn(null);
    },
  };
}

export type LiveMidi = ReturnType<typeof useMidi>;

type MidiLatest = {
  current: {
    dispatch: (action: MidiAction, value: number) => void;
    mapping: MidiMapping;
    learning: MidiAction | null;
  };
};
function useMidiInput(
  input: MIDIInput | undefined,
  latest: MidiLatest,
  learned: (key: string, action: MidiAction) => void,
) {
  const learnRef = useRef(learned);
  learnRef.current = learned;
  useEffect(() => {
    if (!input) return;
    const controls = new MidiControlBuffer();
    const receive = (event: MIDIMessageEvent) => {
      const message = event.data && midiMessage(event.data);
      if (!message) return;
      const key = midiKey(message);
      if (latest.current.learning) {
        controls.reset();
        learnRef.current(key, latest.current.learning);
        return;
      }
      const control = controls.push(message, latest.current.mapping);
      if (control) latest.current.dispatch(control.action, control.value);
    };
    const timer = window.setInterval(() => {
      if (latest.current.learning) {
        controls.reset();
        return;
      }
      for (const { action, value } of controls.flush(latest.current.mapping))
        latest.current.dispatch(action, value);
    }, 100);
    input.addEventListener('midimessage', receive);
    return () => {
      clearInterval(timer);
      input.removeEventListener('midimessage', receive);
      void input.close();
    };
  }, [input, latest]);
}

function useMidiConnection(report: Report) {
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [devices, setDevices] = useState<MIDIInput[]>([]);
  const [connecting, setConnecting] = useState(false);
  const connect = async () => {
    if (!navigator.requestMIDIAccess) {
      report('MIDI is unavailable in this browser. Use Chromium or the on-screen controls.');
      return;
    }
    setConnecting(true);
    try {
      setAccess(await navigator.requestMIDIAccess({ sysex: false }));
    } catch (error) {
      report(
        `Cannot connect MIDI: ${String(error)}. Allow MIDI access or use the on-screen controls.`,
      );
    } finally {
      setConnecting(false);
    }
  };
  useEffect(() => {
    if (!access) return;
    const refresh = () =>
      setDevices([...access.inputs.values()].filter((input) => input.state === 'connected'));
    refresh();
    access.addEventListener('statechange', refresh);
    return () => access.removeEventListener('statechange', refresh);
  }, [access]);
  return { connect, connected: Boolean(access), connecting, devices };
}
