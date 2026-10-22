import { useEffect, useRef, useState } from 'react';

export interface MidiMessage {
  kind: 'note' | 'cc';
  channel: number;
  number: number;
  value: number;
}
export type MidiAction =
  | 'intensity'
  | 'brightness'
  | 'blackout'
  | 'branding'
  | 'messages'
  | `scene-${number}`;
export type MidiMapping = Record<string, MidiAction>;

export function midiMessage(bytes: ArrayLike<number>): MidiMessage | null {
  if (bytes.length < 3) return null;
  const status = bytes[0]!;
  const kind = status & 0xf0;
  if (kind !== 0x90 && kind !== 0xb0) return null;
  if (bytes[1]! > 127 || bytes[2]! > 127 || (kind === 0x90 && bytes[2] === 0)) return null;
  return {
    kind: kind === 0x90 ? 'note' : 'cc',
    channel: (status & 0x0f) + 1,
    number: bytes[1]!,
    value: bytes[2]! / 127,
  };
}
export const midiKey = (message: MidiMessage) =>
  `${message.kind}:${message.channel}:${message.number}`;
export const DEFAULT_MIDI: MidiMapping = Object.fromEntries([
  ['cc:1:1', 'intensity'],
  ['cc:1:7', 'brightness'],
  ['note:1:44', 'blackout'],
  ['note:1:45', 'branding'],
  ['note:1:46', 'messages'],
  ...Array.from({ length: 8 }, (_, index) => [`note:1:${36 + index}`, `scene-${index + 1}`]),
]);
const storageKey = 'setcast-midi-v1';
function readMapping(): MidiMapping {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      saved &&
      typeof saved === 'object' &&
      Object.entries(saved).every(
        ([key, action]) =>
          /^(note|cc):(?:[1-9]|1[0-6]):\d{1,3}$/.test(key) &&
          /^(intensity|brightness|blackout|branding|messages|scene-[1-8])$/.test(String(action)),
      )
    )
      return saved;
  } catch {
    /* Unavailable browser storage does not prevent MIDI controls. */
  }
  return { ...DEFAULT_MIDI };
}

export function useMidi(
  dispatch: (action: MidiAction, value: number) => void,
  report: (message: string) => void,
) {
  const connection = useMidiConnection(report);
  const [selected, select] = useState('');
  const [mapping, setMapping] = useState<MidiMapping>(readMapping);
  const [learning, learn] = useState<MidiAction | null>(null);
  const latest = useRef({ dispatch, mapping, learning });
  latest.current = { dispatch, mapping, learning };
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(mapping));
    } catch {
      /* Session controls still work without persistent storage. */
    }
  }, [mapping]);
  useMidiInput(
    connection.devices.find((device) => device.id === selected),
    latest,
    (key, action) => {
      setMapping((current) =>
        Object.fromEntries([
          ...Object.entries(current).filter(
            ([entry, target]) => entry !== key && target !== action,
          ),
          [key, action],
        ]),
      );
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
    reset: () => setMapping({ ...DEFAULT_MIDI }),
  };
}

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
    const pending = new Map<MidiAction, number>();
    const pressed = new Set<string>();
    const receive = (event: MIDIMessageEvent) => {
      const message = event.data && midiMessage(event.data);
      if (!message) return;
      const key = midiKey(message);
      if (latest.current.learning) {
        learnRef.current(key, latest.current.learning);
        return;
      }
      const action = latest.current.mapping[key];
      if (!action) return;
      if (action === 'intensity' || action === 'brightness') {
        pending.set(action, message.value);
        return;
      }
      if (message.kind === 'cc') {
        if (message.value < 0.5) {
          pressed.delete(key);
          return;
        }
        if (pressed.has(key)) return;
        pressed.add(key);
      }
      latest.current.dispatch(action, message.value);
    };
    const timer = window.setInterval(() => {
      for (const [action, value] of pending) latest.current.dispatch(action, value);
      pending.clear();
    }, 100);
    input.addEventListener('midimessage', receive);
    return () => {
      clearInterval(timer);
      input.removeEventListener('midimessage', receive);
      void input.close();
    };
  }, [input, latest]);
}

function useMidiConnection(report: (message: string) => void) {
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
