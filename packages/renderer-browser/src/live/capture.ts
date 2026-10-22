import { LiveAudio, inputChannels } from './audio.ts';

export interface CaptureSettings {
  device?: string;
  channels: [number, number] | null;
  gain: number;
}

interface CapturePacket {
  start: number;
  left: Float32Array;
  right: Float32Array;
  count: number;
  peaks: number[];
  revision: number;
  dropped: number;
}

export interface CaptureStatus {
  phase: 'stopped' | 'starting' | 'running' | 'error';
  message: string | null;
  device: string;
  channels: number;
  selected: [number, number] | null;
  peaks: number[];
  sampleRate: number;
  dropped: number;
  available: boolean;
}

const stopped = (): CaptureStatus => ({
  phase: 'stopped',
  message: null,
  device: '',
  channels: 0,
  selected: null,
  peaks: [],
  sampleRate: 0,
  dropped: 0,
  available: false,
});

/** One owner per capture session; the graph's only output is silence. */
export class LiveCapture {
  status = stopped();
  audio: LiveAudio | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private generation = 0;
  private revision = 0;
  private lastPacket = 0;
  private muted = false;
  private settings: CaptureSettings = { channels: null, gain: 1 };

  async start(settings: CaptureSettings) {
    this.stop();
    const generation = this.generation;
    this.settings = settings;
    this.status = { ...stopped(), phase: 'starting' };
    let stream: MediaStream | null = null;
    let owned = false;
    let context: AudioContext | null = null;
    try {
      requireCapture();
      // Resume during the user gesture, before awaiting the permission prompt.
      context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      await context.resume();
      if (generation !== this.generation) return;
      const device = await resolveDevice(settings.device);
      if (generation !== this.generation) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints(device),
        video: false,
      });
      if (generation !== this.generation) return;
      this.stream = stream;
      owned = true;
      await context.audioWorklet.addModule('/capture-worklet.js');
      if (generation !== this.generation) return;
      this.connect(context, stream, generation);
    } catch (error) {
      if (generation === this.generation) this.fail(captureError(error));
    } finally {
      if (generation !== this.generation) {
        if (!owned) stream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== 'closed') void context.close();
      }
    }
  }

  stop() {
    this.generation++;
    if (this.node) this.node.onprocessorerror = null;
    if (this.context) this.context.onstatechange = null;
    for (const track of this.stream?.getTracks() ?? []) {
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
    }
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
    this.stream = null;
    this.node = null;
    this.audio = null;
    this.status = stopped();
    this.muted = false;
  }

  checkHealth(now = performance.now()) {
    if (!this.node || now - this.lastPacket < 1500) return;
    this.fail('Audio packets stopped arriving. Check the interface and start input again.');
  }

  route(channels: [number, number], gain: number) {
    inputChannels(channels, this.status.channels);
    if (!Number.isFinite(gain) || gain < 0.1 || gain > 10) {
      throw new Error(`Input sensitivity ${gain} is invalid. Choose a value from 0.1 to 10.`);
    }
    this.settings = { ...this.settings, channels, gain };
    this.revision++;
    this.audio?.clear();
    this.node?.port.postMessage({ type: 'route', channels, gain, revision: this.revision });
    this.status = { ...this.status, selected: channels };
  }

  private connect(context: AudioContext, stream: MediaStream, generation: number) {
    const track = stream.getAudioTracks()[0]!;
    const node = new AudioWorkletNode(context, 'setcast-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCountMode: 'max',
      channelInterpretation: 'discrete',
    });
    this.node = node;
    this.muted = track.muted;
    this.lastPacket = performance.now();
    this.revision = 0;
    this.audio = new LiveAudio(context.sampleRate);
    this.status = {
      ...this.status,
      device: track.label,
      sampleRate: context.sampleRate,
      message: this.muted ? 'The audio input is temporarily unavailable.' : null,
    };
    node.port.onmessage = ({ data }: MessageEvent<CapturePacket>) => {
      if (generation === this.generation) this.receive(data);
    };
    node.onprocessorerror = () =>
      this.fail('Audio capture stopped unexpectedly. Reconnect the input.');
    track.onended = () =>
      this.fail('The audio input disconnected. Reconnect it and start input again.');
    track.onmute = () => {
      this.muted = true;
      this.audio?.clear();
      this.status = {
        ...this.status,
        available: false,
        message: 'The audio input is temporarily unavailable.',
      };
    };
    track.onunmute = () => {
      this.muted = false;
    };
    context.onstatechange = () => {
      if (generation === this.generation && context.state !== 'running') {
        this.fail(`Audio capture is ${context.state}. Start input again to resume.`);
      }
    };
    node.port.postMessage({ type: 'route', ...this.settings, revision: 0 });
    context.createMediaStreamSource(stream).connect(node);
    node.connect(context.destination);
  }

  private receive(packet: CapturePacket) {
    this.node?.port.postMessage({ type: 'ack' });
    if (packet.revision !== this.revision) return;
    this.lastPacket = performance.now();
    this.status = { ...this.status, channels: packet.count };
    try {
      const selected = inputChannels(this.settings.channels, packet.count);
      if (this.muted) {
        packet.left.fill(0);
        packet.right.fill(0);
      }
      this.audio?.append(packet.start, packet.left, packet.right);
      this.status = {
        ...this.status,
        phase: 'running',
        channels: packet.count,
        selected,
        peaks: packet.peaks,
        dropped: packet.dropped,
        available: !this.muted,
        message: this.muted ? this.status.message : null,
      };
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(message: string) {
    const previous = this.status;
    this.stop();
    this.status = { ...previous, peaks: [], phase: 'error', available: false, message };
  }
}

function requireCapture() {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioWorkletNode) {
    throw new Error(
      'Live input needs a browser with AudioWorklet and device access. Open the localhost URL in current Chrome.',
    );
  }
}

async function resolveDevice(device?: string): Promise<string | undefined> {
  if (!device) return undefined;
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.every((entry) => !entry.label)) {
    const permission = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } finally {
      permission.getTracks().forEach((track) => track.stop());
    }
  }
  const matching = devices.find(
    (entry) => entry.kind === 'audioinput' && (entry.deviceId === device || entry.label === device),
  );
  if (!matching) {
    throw new Error(
      `Audio input "${device}" is unavailable. Refresh the device list, then choose an available device.`,
    );
  }
  return matching.deviceId;
}

function constraints(device?: string): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: { ideal: 32 },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (device) audio.deviceId = { exact: device };
  return audio;
}

function captureError(error: unknown): string {
  if (!(error instanceof DOMException))
    return error instanceof Error ? error.message : String(error);
  switch (error.name) {
    case 'NotAllowedError':
      return 'Audio input access was denied. Allow microphone/audio-input access for this localhost page and start again.';
    case 'NotFoundError':
      return 'No audio input is available. Connect your interface, then refresh the device list.';
    case 'NotReadableError':
      return 'The audio input could not be opened. Check the interface and whether another application has exclusive access.';
    case 'OverconstrainedError':
      return 'The selected audio input is unavailable. Refresh the device list and select it again.';
    default:
      return `Cannot start audio input: ${error.message}. Check the interface and try again.`;
  }
}
