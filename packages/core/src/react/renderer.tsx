import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from 'react';
import { resolveFit, type BackgroundFit } from '../background.ts';
import { holdUntil } from './hold.ts';

/** Deliberately small: only what every renderer can honor. Appearance belongs in CSS. */
export interface MediaProps {
  src: string;
  className?: string;
  style?: CSSProperties;
}
export type ImgProps = MediaProps;
export type VideoProps = MediaProps & {
  /** Background fitting; auto preserves art whose aspect ratio differs substantially. */
  fit?: BackgroundFit;
  /** Repeat for as long as the video is on screen. */
  loop?: boolean;
  /** Silence the video's own audio. In a render the set audio is the only sound. */
  muted?: boolean;
};

/** Private host diagnostics. Renderers decide where to display or record them. */
export interface RendererDiagnostic {
  level: 'info' | 'warning';
  source: string;
  code: string;
  message: string;
}

/**
 * What a renderer adapter plugs in. `hold` marks the current frame as not ready until the returned
 * release function is called (Remotion: delayRender/continueRender; a future renderer: its own
 * frame-ready handshake).
 */
export interface RendererBindings {
  name: string;
  /** Live-only drawing-buffer scale. Offline renderers leave it at 1. */
  renderScale?: number;
  /** Document containing the scene, when an adapter renders through a portal. */
  document?: Document;
  Img: ComponentType<ImgProps>;
  Video: ComponentType<VideoProps>;
  hold: (label: string) => () => void;
  diagnostic?: (event: RendererDiagnostic) => void;
  /** Maps a project-relative path (`assets/bg.png`) to a URL the renderer serves. */
  asset: (path: string) => string;
}

export const domBindings: RendererBindings = {
  name: 'dom',
  Img: (props) => <img {...props} />,
  Video: DomVideo,
  hold: () => () => {},
  asset: (path) => path,
};

function DomVideo({ fit, style, ...props }: VideoProps) {
  const [objectFit, setFit] = useState<'contain' | 'cover'>(
    fit === 'contain' ? 'contain' : 'cover',
  );
  return (
    <video
      {...props}
      style={{ ...style, ...(fit ? { objectFit: fit === 'auto' ? objectFit : fit } : {}) }}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (fit)
          setFit(
            resolveFit(
              fit,
              { width: video.videoWidth, height: video.videoHeight },
              video.getBoundingClientRect(),
            ),
          );
      }}
    />
  );
}

const isUrl = (src: string) => /^(?:[a-z]+:|\/\/|\/)/i.test(src);

/** Resolves a project-relative path through the renderer; URLs and data URIs pass through. */
export function useAssetUrl(src: string): string {
  return useAssetResolver()(src);
}

/** `useAssetUrl` for a path known only later, or not at all. */
export function useAssetResolver(): (src: string) => string {
  const { asset } = useRenderer();
  return (src) => (isUrl(src) ? src : asset(src));
}

const RendererContext = createContext<RendererBindings>(domBindings);

export function RendererProvider({
  bindings,
  children,
}: {
  bindings: RendererBindings;
  children: ReactNode;
}) {
  return <RendererContext value={bindings}>{children}</RendererContext>;
}

export const useRenderer = (): RendererBindings => useContext(RendererContext);

/** An image that holds the frame until it has loaded, whichever renderer is bound. */
export function Img(props: ImgProps) {
  const { Img: Bound } = useRenderer();
  const { src } = useAsset(props.src);
  return <Bound {...props} src={src} />;
}

export function Video(props: VideoProps) {
  const { Video: Bound } = useRenderer();
  return <Bound {...props} src={useAssetUrl(props.src)} />;
}

interface HoldState {
  label: string;
  ready: boolean;
  error: Error | null;
  revision: unknown;
}

/** Holds the frame until `load` resolves and reports load failures through React. */
export function useHoldUntil(
  label: string,
  load: () => Promise<unknown>,
  revision?: unknown,
): boolean {
  const { hold } = useRenderer();
  const [state, setState] = useState<HoldState>({ label, ready: false, error: null, revision });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const release = hold(label);
    setState({ label, ready: false, error: null, revision });
    return holdUntil(
      () => loadRef.current(),
      release,
      (result) => setState({ label, revision, ...result }),
    );
  }, [hold, label, revision]);

  // State left over from a previous label describes a resource this render no longer waits for.
  if (state.label !== label || state.revision !== revision) return false;
  if (state.error) throw state.error;
  return state.ready;
}

/** Holds the frame for as long as `waiting` is true. */
export function useHoldWhile(label: string, waiting: boolean): void {
  const { hold } = useRenderer();
  useLayoutEffect(() => (waiting ? hold(label) : undefined), [hold, label, waiting]);
}

/** Resolves and preloads an image (or any URL) and holds the frame until it has loaded. */
export function useAsset(src: string): { src: string; ready: boolean } {
  const url = useAssetUrl(src);
  const ready = useHoldUntil(`asset:${url}`, () => preloadImage(url));
  return { src: url, ready };
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

/** Holds the frame until every @font-face in the document has loaded. */
export function useFontsReady(revision?: unknown): boolean {
  const owner = useRenderer().document;
  return useHoldUntil(
    'fonts',
    () => {
      if (owner) return owner.fonts.ready;
      return typeof document === 'undefined' ? Promise.resolve() : document.fonts.ready;
    },
    revision,
  );
}
