/* global AudioWorkletProcessor, registerProcessor, currentFrame */
const PACKET_SAMPLES = 1024;
const MAX_PENDING = 8;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.origin = null;
    this.pending = 0;
    this.channels = null;
    this.gain = 1;
    this.revision = 0;
    this.dropped = 0;
    this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'ack') this.pending = Math.max(0, this.pending - 1);
      if (data.type === 'route') {
        this.channels = data.channels;
        this.gain = data.gain;
        this.revision = data.revision;
        this.reset();
      }
    };
  }

  reset() {
    this.position = 0;
    this.left = new Float32Array(PACKET_SAMPLES);
    this.right = new Float32Array(PACKET_SAMPLES);
    this.peaks = [];
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length || !channels[0].length) return true;
    if (this.origin === null) this.origin = currentFrame;
    const selected = this.channels ?? [1, Math.min(2, channels.length)];
    for (let sample = 0; sample < channels[0].length; sample++) {
      if (this.position === 0) this.start = currentFrame + sample - this.origin;
      this.left[this.position] = scaled(channels[selected[0] - 1]?.[sample] ?? 0, this.gain);
      this.right[this.position] = scaled(channels[selected[1] - 1]?.[sample] ?? 0, this.gain);
      for (let channel = 0; channel < channels.length; channel++) {
        this.peaks[channel] = Math.max(
          this.peaks[channel] ?? 0,
          Math.abs(channels[channel][sample]),
        );
      }
      this.position++;
      if (this.position === PACKET_SAMPLES) this.flush(channels.length);
    }
    return true;
  }

  flush(count) {
    if (this.pending >= MAX_PENDING) {
      this.dropped += PACKET_SAMPLES;
      this.position = 0;
      this.peaks = [];
      return;
    }
    this.pending++;
    this.port.postMessage(
      {
        start: this.start,
        left: this.left,
        right: this.right,
        count,
        peaks: this.peaks,
        revision: this.revision,
        dropped: this.dropped,
      },
      [this.left.buffer, this.right.buffer],
    );
    this.reset();
  }
}

const scaled = (sample, gain) => Math.max(-1, Math.min(1, sample * gain));

registerProcessor('setcast-capture', CaptureProcessor);
