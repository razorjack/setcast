import { LivePlayer } from '../live/player.tsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { errorMessage, clamp, type ResolvedProject, type SceneProject } from '@setcast/core';
import type { Transport } from '../transport.ts';
import { DropOverlay, useArt } from './art.tsx';
import { useAutoHide } from './autohide.ts';
import { Dock } from './dock.tsx';
import { useShortcuts } from './keyboard.ts';
import { creditsOf, withArt, withCredits, type Credits } from './overrides.ts';
import { usePlayback, type PlaybackSnapshot } from './playback.ts';
import { Scene, SceneBoundary } from './scene.tsx';
import { fetchProject, requestedTheme, useThemes } from './themes.ts';
import { useVolume } from './volume.ts';

export function mountPlayer(element: HTMLElement) {
  const root = createRoot(element);
  void loadInitialProject()
    .then(({ project, notice }) => {
      document.title = `${project.title || 'Setcast'} / Player`;
      if (project.mix === null) {
        root.render(<LivePlayer initial={project} startupNotice={notice} />);
      } else {
        root.render(<Player initial={project} startupNotice={notice} />);
      }
    })
    .catch((error: unknown) => {
      root.render(
        <p className="sc-player-message" role="alert">
          {errorMessage(error)}
        </p>,
      );
    });
}

/** The theme in the URL, or the project's own when the URL names none or one that fails. */
async function loadInitialProject() {
  const requested = requestedTheme();
  if (!requested) return { project: await fetchProject<SceneProject>(null), notice: null };
  try {
    return { project: await fetchProject<SceneProject>(requested), notice: null };
  } catch (error) {
    history.replaceState(null, '', location.pathname);
    const reason = errorMessage(error);
    return {
      project: await fetchProject<SceneProject>(null),
      notice: `Cannot show ${requested}: ${reason}`,
    };
  }
}

interface Notice {
  message: string;
  tone: 'info' | 'error';
  id: number;
  persistent?: boolean;
}

function Player({
  initial,
  startupNotice,
}: {
  initial: ResolvedProject;
  startupNotice: string | null;
}) {
  const notices = useNotices(startupNotice);
  const adjusted = useAdjustedProject(initial, notices.report);
  const { audio, transport, snapshot } = usePlayback(adjusted.project);
  const dock = useRef<HTMLElement>(null);
  const dockHeight = useHeight(dock);
  const autoHide = useAutoHide(dock);
  const controls = {
    ...adjusted,
    transport,
    volume: useVolume(audio),
    autoHide,
    fullscreen: useFullscreen(notices.report),
  };
  usePlayerShortcuts(controls, notices.inform);

  return (
    <main
      className="sc-player"
      data-frame={snapshot.frame}
      data-windows={snapshot.windows}
      data-dock={autoHide.enabled ? 'auto' : 'pinned'}
      data-idle={autoHide.idle}
      style={{ '--dock-height': `${dockHeight}px` }}
    >
      <Viewport
        project={adjusted.project}
        snapshot={snapshot}
        transport={transport}
        onDoubleClick={autoHide.toggle}
      />
      <Dock dock={dock} snapshot={snapshot} {...controls} report={notices.saved} />
      {adjusted.art.dragging && <DropOverlay />}
      {notices.notice && (
        <NoticeBar key={notices.notice.id} notice={notices.notice} dismiss={notices.dismiss} />
      )}
    </main>
  );
}

/** The project as the viewer adjusted it in the player: its theme, credits and art. */
function useAdjustedProject(initial: ResolvedProject, report: (message: string) => void) {
  const themes = useThemes(initial, report);
  const art = useArt(report);
  const [credits, setCredits] = useState<Credits | null>(null);
  const project = useMemo(
    () => withArt(withCredits(themes.project, credits), art.art),
    [themes.project, credits, art.art],
  );
  return { project, themes, art, credits: { value: creditsOf(project), set: setCredits } };
}

function useNotices(startup: string | null) {
  const [notice, setNotice] = useState<Notice | null>(
    startup ? { message: startup, tone: 'error', id: 0 } : null,
  );
  const report = useCallback((message: string) => {
    setNotice({ message, tone: 'error', id: performance.now() });
  }, []);
  const inform = useCallback((message: string) => {
    setNotice({ message, tone: 'info', id: performance.now() });
  }, []);
  const saved = useCallback((message: string, failed = false) => {
    setNotice({
      message,
      tone: failed ? 'error' : 'info',
      id: performance.now(),
      persistent: true,
    });
  }, []);
  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, report, inform, saved, dismiss };
}

const CREDIT_ORDER: Credits[] = ['panels', 'tracklist', 'both'];
const CREDIT_NAMES: Record<Credits, string> = {
  panels: 'Panels',
  tracklist: 'Tracklist',
  both: 'Panels and tracklist',
};

interface ShortcutTargets {
  transport: Transport;
  themes: { step: (offset: number) => string | null };
  credits: { value: Credits | null; set: (credits: Credits) => void };
  volume: { toggleMute: () => void };
  autoHide: { shown: boolean; toggle: () => void; reveal: () => void };
  fullscreen: { toggle: () => void };
}

/** `inform` names a change made from the keyboard while the dock that would show it is hidden. */
function usePlayerShortcuts(targets: ShortcutTargets, inform: (message: string) => void) {
  const { transport, themes, credits, volume, autoHide, fullscreen } = targets;
  const announce = (message: string) => {
    if (!autoHide.shown) inform(message);
  };
  const cycleCredits = () => {
    const current = CREDIT_ORDER.indexOf(credits.value ?? 'both');
    const next = CREDIT_ORDER[(current + 1) % CREDIT_ORDER.length]!;
    credits.set(next);
    announce(CREDIT_NAMES[next]);
  };
  const stepTheme = (offset: number) => {
    const theme = themes.step(offset);
    if (theme) announce(theme);
  };
  const openShortcuts = () => {
    autoHide.reveal();
    document.getElementById('sc-shortcuts')?.togglePopover();
  };
  useShortcuts({
    ' ': () => togglePlayback(transport),
    ArrowLeft: (event) => seekBy(transport, event.shiftKey ? -30 : -5),
    ArrowRight: (event) => seekBy(transport, event.shiftKey ? 30 : 5),
    '[': () => stepTheme(-1),
    ']': () => stepTheme(1),
    c: cycleCredits,
    m: volume.toggleMute,
    h: autoHide.toggle,
    f: fullscreen.toggle,
    '?': openShortcuts,
  });
}

const togglePlayback = (transport: Transport) =>
  transport.wanted ? transport.pause() : transport.play();

function seekBy(transport: Transport, seconds: number) {
  transport.seek(clamp(transport.media.currentTime + seconds, 0, transport.duration));
}

function useHeight(element: React.RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize[0]?.blockSize ?? 0);
    });
    observer.observe(element.current!);
    return () => observer.disconnect();
  }, [element]);
  return height;
}

function useFullscreen(report: (message: string) => void) {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const change = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const toggle = () => {
    const pending = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void pending.catch(() =>
      report('The browser refused full screen. Use its own full screen command.'),
    );
  };
  return { active, toggle };
}

interface ViewportProps {
  project: ResolvedProject;
  snapshot: PlaybackSnapshot;
  transport: Transport;
  onDoubleClick: () => void;
}

function Viewport({ project, snapshot, transport, onDoubleClick }: ViewportProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(
          Math.min(
            entry.contentRect.width / project.width,
            entry.contentRect.height / project.height,
          ),
        );
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [project.width, project.height]);
  return (
    <div ref={viewport} className="sc-player-viewport" onDoubleClick={onDoubleClick}>
      <div
        className="sc-player-canvas"
        style={{
          width: project.width,
          height: project.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <SceneBoundary onError={(error) => transport.fail(error)}>
          {snapshot.analyzer && (
            <Scene
              project={project}
              analyzer={snapshot.analyzer}
              frame={snapshot.frame}
              transport={transport}
              running={snapshot.running}
            />
          )}
        </SceneBoundary>
      </div>
      <PlaybackMessage snapshot={snapshot} />
    </div>
  );
}

function PlaybackMessage({ snapshot }: { snapshot: PlaybackSnapshot }) {
  if (snapshot.error)
    return (
      <div className="sc-player-message" role="alert">
        <strong>Playback stopped</strong>
        <p>{snapshot.error}</p>
        <button className="sc-button sc-button-primary" onClick={() => location.reload()}>
          Reload player
        </button>
      </div>
    );
  if (!snapshot.analyzer)
    return (
      <div className="sc-player-message" role="status">
        <span className="sc-spinner" />
        Preparing the set
      </div>
    );
  return null;
}

const NOTICE_MS = { info: 1400, error: 9000 };

function NoticeBar({ notice, dismiss }: { notice: Notice; dismiss: () => void }) {
  useEffect(() => {
    if (notice.persistent) return;
    const timer = setTimeout(dismiss, NOTICE_MS[notice.tone]);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);
  return (
    <div
      className="sc-notice"
      data-tone={notice.tone}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.message}</span>
      {(notice.tone === 'error' || notice.persistent) && (
        <button className="sc-notice-close" aria-label="Dismiss" onClick={dismiss}>
          ×
        </button>
      )}
    </div>
  );
}
