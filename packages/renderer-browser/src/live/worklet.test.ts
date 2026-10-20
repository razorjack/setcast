import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vite-plus/test';

interface Packet {
  start: number;
  left: Float32Array;
  right: Float32Array;
  peaks: number[];
  count: number;
  revision: number;
  dropped: number;
}
const source = await readFile(new URL('../../entry/capture-worklet.js', import.meta.url), 'utf8');

function worklet() {
  const packets: Packet[] = [];
  const port = {
    onmessage: (_event: { data: unknown }) => {},
    postMessage: (packet: Packet) => packets.push(packet),
  };
  let Processor: new () => { process: (inputs: Float32Array[][]) => boolean };
  const environment = {
    currentFrame: 5000,
    AudioWorkletProcessor: class {
      port = port;
    },
    registerProcessor: (_name: string, constructor: typeof Processor) => {
      Processor = constructor;
    },
  };
  runInNewContext(source, environment);
  const processor = new Processor!();
  const tick = (channels: number[]) => {
    processor.process([channels.map((level) => new Float32Array(128).fill(level))]);
    environment.currentFrame += 128;
  };
  const send = (data: unknown) => port.onmessage({ data });
  return { tick, send, packets };
}

test('worklet routes exposed channels and bounds the queue across stalls and recovery', () => {
  const capture = worklet();
  capture.send({ type: 'route', channels: [3, 4], gain: 2, revision: 1 });
  for (let block = 0; block < 80; block++) capture.tick([0.1, 0.2, 0.3, 0.4]);
  expect(capture.packets).toHaveLength(8);
  const first = capture.packets[0]!;
  expect(first.start).toBe(0);
  expect(first.count).toBe(4);
  expect(first.left[0]).toBeCloseTo(0.6);
  expect(first.right[0]).toBeCloseTo(0.8);
  expect(first.peaks[3]).toBeCloseTo(0.4);
  capture.send({ type: 'ack' });
  for (let block = 0; block < 8; block++) capture.tick([0.1, 0.2, 0.3, 0.4]);
  expect(capture.packets).toHaveLength(9);
  expect(capture.packets[8]).toMatchObject({ start: 10240, dropped: 2048, revision: 1 });
});

test('worklet defaults to duplicated mono and discards a partially routed packet on change', () => {
  const capture = worklet();
  for (let block = 0; block < 8; block++) capture.tick([0.2]);
  expect(capture.packets[0]!.left).toEqual(capture.packets[0]!.right);
  capture.send({ type: 'ack' });
  capture.tick([0.2, 0.5]);
  capture.send({ type: 'route', channels: [2, 2], gain: 1, revision: 2 });
  for (let block = 0; block < 8; block++) capture.tick([0.2, 0.5]);
  expect(capture.packets[1]).toMatchObject({ start: 1152, revision: 2 });
  expect([...capture.packets[1]!.left]).toEqual(new Array(1024).fill(0.5));
});

test('worklet clamps sensitivity without hiding raw input meter levels', () => {
  const capture = worklet();
  capture.send({ type: 'route', channels: [1, 2], gain: 10, revision: 1 });
  for (let block = 0; block < 8; block++) capture.tick([0.3, -0.4]);
  expect(capture.packets[0]!.left[0]).toBe(1);
  expect(capture.packets[0]!.right[0]).toBe(-1);
  expect(capture.packets[0]!.peaks[1]).toBeCloseTo(0.4);
});
