import { Component, memo, useMemo, type ReactNode } from 'react';
import { Timeline, type AudioAnalyzer, type ResolvedProject } from '@setcast/core';
import {
  FrameProvider,
  RendererProvider,
  resolveFrame,
  Stage,
  type RendererBindings,
} from '@setcast/core/react';
import type { Transport } from '../transport.ts';
import { BrowserVideo, TransportContext } from './video.tsx';
import { assetUrl } from './url.ts';

export const Scene = memo(function Scene({
  project,
  analyzer,
  frame,
  transport,
  running,
}: {
  project: ResolvedProject;
  analyzer: AudioAnalyzer;
  frame: number;
  transport: Transport;
  running: boolean;
}) {
  const timeline = useMemo(() => new Timeline(project.mix), [project.mix]);
  const bindings = useMemo<RendererBindings>(
    () => ({
      name: 'browser',
      asset: assetUrl,
      hold: transport.hold,
      Img: (props) => <img {...props} />,
      Video: BrowserVideo,
    }),
    [transport],
  );
  const playback = useMemo(() => ({ transport, running }), [transport, running]);
  const resolved = resolveFrame({ project, timeline, analyzer, frame });
  return (
    <TransportContext value={playback}>
      <RendererProvider bindings={bindings}>
        <FrameProvider frame={resolved}>
          <Stage />
        </FrameProvider>
      </RendererProvider>
    </TransportContext>
  );
});

export class SceneBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
