import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ImgHTMLAttributes,
  type ReactNode,
  type VideoHTMLAttributes,
} from 'react';

export type ImgProps = ImgHTMLAttributes<HTMLImageElement> & { src: string };
export type VideoProps = VideoHTMLAttributes<HTMLVideoElement> & { src: string };

/**
 * What a renderer adapter plugs in. `hold` marks the current frame as not ready until the returned
 * release function is called (Remotion: delayRender/continueRender; a future renderer: its own
 * frame-ready handshake).
 */
export interface RendererBindings {
  name: string;
  Img: ComponentType<ImgProps>;
  Video: ComponentType<VideoProps>;
  hold: (label: string) => () => void;
  /** Maps a project-relative path (`assets/bg.png`) to a URL the renderer serves. */
  asset: (path: string) => string;
}

export const domBindings: RendererBindings = {
  name: 'dom',
  Img: (props) => <img {...props} />,
  Video: (props) => <video {...props} />,
  hold: () => () => {},
  asset: (path) => path,
};

const isUrl = (src: string) => /^(?:[a-z]+:|\/\/|\/)/i.test(src);

/** Resolves a project-relative path through the renderer; URLs and data URIs pass through. */
export function useAssetUrl(src: string): string {
  const { asset } = useRenderer();
  return isUrl(src) ? src : asset(src);
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

export function Img(props: ImgProps) {
  const { Img: Bound } = useRenderer();
  return <Bound {...props} src={useAssetUrl(props.src)} />;
}

export function Video(props: VideoProps) {
  const { Video: Bound } = useRenderer();
  return <Bound {...props} src={useAssetUrl(props.src)} />;
}

/** Holds the frame until `load` resolves. The hold starts synchronously on first render. */
export function useHoldUntil(label: string, load: () => Promise<unknown>): boolean {
  const { hold } = useRenderer();
  const [release] = useState(() => hold(label));
  const [ready, setReady] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let live = true;
    void loadRef
      .current()
      .catch(() => {})
      .then(() => {
        if (live) setReady(true);
        release();
      });
    return () => {
      live = false;
    };
  }, [label, release]);
  return ready;
}

/** Resolves and preloads an image (or any URL) and holds the frame until it has loaded. */
export function useAsset(src: string): { src: string; ready: boolean } {
  const url = useAssetUrl(src);
  const ready = useHoldUntil(
    `asset:${url}`,
    () =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load ${url}`));
        img.src = url;
      }),
  );
  return { src: url, ready };
}

/** Holds the frame until every @font-face in the document has loaded. */
export function useFontsReady(): boolean {
  return useHoldUntil('fonts', () =>
    typeof document === 'undefined' ? Promise.resolve() : document.fonts.ready,
  );
}
