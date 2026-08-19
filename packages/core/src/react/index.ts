import './css.ts';

export { Background } from './components/Background.tsx';
export { Header } from './components/Header.tsx';
export { NowPlaying } from './components/NowPlaying.tsx';
export { Spectrum, SpectrumConfigSchema, type SpectrumConfig } from './components/Spectrum.tsx';
export {
  FrameProvider,
  useAudioFeatures,
  useComposition,
  useEventState,
  useFrame,
  useModulation,
  useTime,
  type CompositionState,
  type RenderFrame,
} from './frame.tsx';
export {
  Img,
  RendererProvider,
  Video,
  domBindings,
  useAsset,
  useAssetUrl,
  useFontsReady,
  useHoldUntil,
  useRenderer,
  type ImgProps,
  type MediaProps,
  type RendererBindings,
  type VideoProps,
} from './renderer.tsx';
export { Stage } from './Stage.tsx';
export { defineVisualizer, visualizers, type Visualizer } from './visualizers.ts';
