export {
  BANDS,
  BIN_COUNT,
  FEATURE_SOURCES,
  SILENCE,
  bandEnergy,
  logBins,
  rms,
  silentAnalyzer,
  soft,
  spectrumFeatures,
  type AudioAnalyzer,
  type AudioFeatures,
  type FeatureSource,
  type Spectrum,
} from './audio.ts';
export {
  OutputSchema,
  ProjectConfigSchema,
  TrackEntrySchema,
  type ProjectConfig,
  type ProjectConfigInput,
  type TrackEntry,
} from './config.ts';
export {
  DeckSchema,
  EVENT_TYPES,
  EventSchema,
  SECTION_TYPES,
  TimeSchema,
  TrackSchema,
  sortEvents,
  type EventOf,
  type EventType,
  type SectionType,
  type SetEvent,
  type Track,
} from './events.ts';
export { importers } from './importers/index.ts';
export { plainImporter, type Importer } from './importers/plain.ts';
export {
  CURVES,
  ModRouteSchema,
  evaluateModulation,
  evaluateRoute,
  modulationVars,
  type Curve,
  type ModContext,
  type ModRoute,
} from './modulation.ts';
export {
  clamp,
  ease,
  impulse,
  interpolate,
  lerp,
  rampUp,
  spring,
  type Easing,
  type InterpolateOptions,
  type SpringConfig,
} from './motion.ts';
export { ConfigError, SetcastError, zodIssues, type Issue } from './errors.ts';
export type { ResolvedProject } from './project.ts';
export type { Theme } from './theme.ts';
export { Registry } from './registry.ts';
export { formatChapterTime, formatTime, parseTime } from './time.ts';
export { Timeline, since, until, type EventState } from './timeline.ts';
export { chapters, youtubeDescription } from './chapters.ts';
export {
  RadialConfigSchema,
  SpectrumConfigSchema,
  VisualizerConfigSchema,
  resolveVisualizerConfig,
  visualizers,
  type RadialConfig,
  type SpectrumConfig,
  type VisualizerSpec,
} from './visualizers.ts';
