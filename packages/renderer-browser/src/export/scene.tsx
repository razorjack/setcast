import { useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Timeline, type ResolvedProject } from '@setcast/core';
import {
  FrameProvider,
  RendererProvider,
  resolveFrame,
  Stage,
  type RenderFrame,
} from '@setcast/core/react';
import { openAnalysis } from '../browser/decode.ts';
import { SceneBoundary } from '../browser/scene.tsx';
import { assetUrl } from '../browser/url.ts';
import { FrameReadiness } from './readiness.ts';
import { ExportVideo } from './video.tsx';

export interface ExportDriver {
  frame(frame: number): Promise<number>;
  close(): void;
}
declare global {
  interface Window {
    setcastExport?: ExportDriver;
  }
}

export function mountExport(element: HTMLElement) {
  const root = createRoot(element);
  const readiness = new FrameReadiness();
  const initialized = initialize();
  void initialized.catch(() => {});
  const bindings = {
    name: 'browser-export',
    Img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
    Video: ExportVideo,
    asset: assetUrl,
    hold: readiness.hold,
  };
  window.setcastExport = {
    async frame(frame) {
      const { project, timeline, analysis } = await initialized;
      await analysis.windows.prepare(frame / project.fps);
      const analyzer = analysis.windows.at(frame / project.fps);
      if (!analyzer) throw new Error(`Audio analysis is unavailable at frame ${frame}.`);
      const resolved = resolveFrame({ project, timeline, analyzer, frame });
      flushSync(() =>
        root.render(
          <SceneBoundary
            onError={(error) => {
              readiness.error = error instanceof Error ? error : new Error(String(error));
            }}
          >
            <RendererProvider bindings={bindings}>
              <ExportFrame frame={resolved} readiness={readiness} />
            </RendererProvider>
          </SceneBoundary>,
        ),
      );
      await readiness.settle(frame);
      return frame;
    },
    close() {
      root.unmount();
      void initialized.then(({ analysis }) => analysis.dispose()).catch(() => {});
    },
  };
}

async function initialize() {
  const project: ResolvedProject = await (await fetch('/project.json')).json();
  const timeline = new Timeline(project.mix);
  const analysis = await openAnalysis(assetUrl(project.audio), project.mix.duration / 1_000_000);
  return { project, timeline, analysis };
}

function ExportFrame({ frame, readiness }: { frame: RenderFrame; readiness: FrameReadiness }) {
  useLayoutEffect(() => {
    readiness.committed = frame.frame;
  });
  useEffect(() => {
    readiness.effected = frame.frame;
  });
  return (
    <FrameProvider frame={frame}>
      <Stage key={frame.composition.project.theme} />
    </FrameProvider>
  );
}
