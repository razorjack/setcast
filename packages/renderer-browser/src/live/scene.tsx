import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Announcement,
  PerformanceState,
  AudioAnalyzer,
  ResolvedLiveProject,
  Projection,
} from '@setcast/core';
import {
  FrameProvider,
  RendererProvider,
  resolveLiveFrame,
  Stage,
  type RendererBindings,
} from '@setcast/core/react';
import { SceneBoundary } from '../browser/scene.tsx';
import { assetUrl } from '../browser/url.ts';
import { LiveReadiness } from './readiness.ts';
import { ProjectionFrame } from './projection-frame.tsx';
import { LiveVideo } from './video.tsx';

interface SceneProps {
  project: ResolvedLiveProject;
  performance?: PerformanceState;
  announcements?: readonly Announcement[];
  onReady?: (project: ResolvedLiveProject) => void;
  onFailure?: () => void;
  analyzer: AudioAnalyzer;
  frame: number;
  report: (message: string) => void;
  renderScale?: number;
  black?: boolean;
  projection?: Projection;
  pattern?: boolean;
  document?: Document;
}

/** Keep the ready scene visible until a replacement's artwork, fonts and video have loaded. */
export function LiveViewport(props: SceneProps) {
  const { viewport, scale } = useStageScale(props.project);
  const { visible, pending, ready, error } = useSceneReadiness(props);
  const layers: ResolvedLiveProject[] = [];
  if (visible) layers.push(visible);
  if (pending) layers.push(props.project);
  return (
    <div ref={viewport} className="sc-player-viewport">
      <div
        className="sc-player-canvas"
        style={{
          width: props.project.width,
          height: props.project.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {props.projection?.enabled ? (
          <ProjectionFrame
            config={props.projection}
            width={props.project.width}
            height={props.project.height}
            pattern={props.pattern ?? false}
            brightness={props.performance?.brightness ?? 1}
          >
            {(document) => (
              <SceneLayers {...{ layers, visible, ready, error, props }} document={document} />
            )}
          </ProjectionFrame>
        ) : (
          <SceneLayers {...{ layers, visible, ready, error, props }} />
        )}
        {props.black && <div className="sc-input-fallback" aria-hidden="true" />}
      </div>
    </div>
  );
}

function SceneLayers({
  layers,
  visible,
  ready,
  error,
  props,
  document,
}: {
  layers: ResolvedLiveProject[];
  visible: ResolvedLiveProject | null;
  ready: () => void;
  error: (project: ResolvedLiveProject, cause: unknown) => void;
  props: SceneProps;
  document?: Document;
}) {
  return (
    <>
      {layers.map((project) => (
        <div className="sc-live-scene" data-ready={project === visible} key={sceneKey(project)}>
          <SceneBoundary onError={(cause) => error(project, cause)}>
            <LiveScene
              performance={props.performance}
              announcements={props.announcements}
              renderScale={props.renderScale}
              project={project}
              analyzer={props.analyzer}
              frame={props.frame}
              document={document}
              ready={project === visible ? undefined : ready}
            />
          </SceneBoundary>
        </div>
      ))}
    </>
  );
}

function useStageScale({ width, height }: { width: number; height: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setScale(Math.min(entry.contentRect.width / width, entry.contentRect.height / height));
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [width, height]);
  return { viewport, scale };
}

const sceneIds = new WeakMap<ResolvedLiveProject, number>();
let nextSceneId = 0;
function sceneKey(project: ResolvedLiveProject) {
  if (!sceneIds.has(project)) sceneIds.set(project, nextSceneId++);
  return sceneIds.get(project)!;
}

const LiveImage: RendererBindings['Img'] = (props) => <img {...props} />;

const LiveScene = memo(function LiveScene({
  project,
  analyzer,
  frame,
  ready,
  performance,
  announcements,
  renderScale,
  document,
}: Omit<SceneProps, 'report'> & { ready?: () => void }) {
  const [readiness] = useState(() => new LiveReadiness());
  const bindings = useMemo<RendererBindings>(
    () => ({
      name: 'browser-live',
      renderScale,
      document,
      asset: assetUrl,
      hold: readiness.hold,
      Img: LiveImage,
      Video: LiveVideo,
    }),
    [readiness, renderScale, document],
  );
  useReady(readiness, ready);
  const resolved = resolveLiveFrame({ project, analyzer, frame, performance, announcements });
  return (
    <RendererProvider bindings={bindings}>
      <FrameProvider frame={resolved}>
        <Stage />
      </FrameProvider>
    </RendererProvider>
  );
});

function useReady(readiness: LiveReadiness, ready?: () => void) {
  const [error, fail] = useState<Error | null>(null);
  if (error) throw error;
  useEffect(() => {
    if (!ready) return;
    let request = 0;
    const deadline = performance.now() + 30_000;
    let quiet = 0;
    let revision = readiness.revision;
    const tick = () => {
      if (performance.now() > deadline) {
        fail(
          new Error(
            'Scene assets did not become ready within 30 seconds. Check the artwork and video files.',
          ),
        );
        return;
      }
      quiet = readiness.ready && revision === readiness.revision ? quiet + 1 : 0;
      revision = readiness.revision;
      if (quiet >= 3) {
        ready();
        return;
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [readiness, ready]);
}

function useSceneReadiness(props: SceneProps) {
  const { report, onReady, onFailure, project: requested } = props;
  const [visible, setVisible] = useState<ResolvedLiveProject | null>(null);
  const [failed, setFailed] = useState<ResolvedLiveProject | null>(null);
  const pending = requested !== visible && requested !== failed;
  const ready = useCallback(() => {
    setVisible(requested);
    onReady?.(requested);
  }, [requested, onReady]);
  const error = useCallback(
    (project: ResolvedLiveProject, cause: unknown) => {
      setFailed(project);
      onFailure?.();
      setVisible((current) => (current === project ? null : current));
      report(
        `Cannot prepare this scene: ${cause instanceof Error ? cause.message : String(cause)}. Choose another theme or artwork.`,
      );
    },
    [report, onFailure],
  );
  return { visible, pending, ready, error };
}
