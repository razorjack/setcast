import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioAnalyzer, ResolvedLiveProject } from '@setcast/core';
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
import { LiveVideo } from './video.tsx';

interface SceneProps {
  project: ResolvedLiveProject;
  analyzer: AudioAnalyzer;
  frame: number;
  report: (message: string) => void;
}

/** Keep the ready scene visible until a replacement's artwork, fonts and video have loaded. */
export function LiveViewport(props: SceneProps) {
  const { viewport, scale } = useStageScale(props.project);
  const { report } = props;
  const [visible, setVisible] = useState<ResolvedLiveProject | null>(null);
  const [failed, setFailed] = useState<ResolvedLiveProject | null>(null);
  const pending = props.project !== visible && props.project !== failed;
  const ready = useCallback(() => setVisible(props.project), [props.project]);
  const error = useCallback(
    (project: ResolvedLiveProject, cause: unknown) => {
      setFailed(project);
      setVisible((current) => (current === project ? null : current));
      report(
        `Cannot prepare this scene: ${cause instanceof Error ? cause.message : String(cause)}. Choose another theme or artwork.`,
      );
    },
    [report],
  );
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
        {layers.map((project) => (
          <div className="sc-live-scene" data-ready={project === visible} key={sceneKey(project)}>
            <SceneBoundary onError={(cause) => error(project, cause)}>
              <LiveScene
                project={project}
                analyzer={props.analyzer}
                frame={props.frame}
                ready={project === visible ? undefined : ready}
              />
            </SceneBoundary>
          </div>
        ))}
      </div>
    </div>
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

const LiveScene = memo(function LiveScene({
  project,
  analyzer,
  frame,
  ready,
}: Omit<SceneProps, 'report'> & { ready?: () => void }) {
  const [readiness] = useState(() => new LiveReadiness());
  const bindings = useMemo<RendererBindings>(
    () => ({
      name: 'browser-live',
      asset: assetUrl,
      hold: readiness.hold,
      Img: (props) => <img {...props} />,
      Video: LiveVideo,
    }),
    [readiness],
  );
  useReady(readiness, ready);
  const resolved = resolveLiveFrame({ project, analyzer, frame });
  return (
    <RendererProvider bindings={bindings}>
      <FrameProvider frame={resolved}>
        <Stage />
      </FrameProvider>
    </RendererProvider>
  );
});

function useReady(readiness: LiveReadiness, ready?: () => void) {
  useEffect(() => {
    if (!ready) return;
    let request = 0;
    let quiet = 0;
    let revision = readiness.revision;
    const tick = () => {
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
