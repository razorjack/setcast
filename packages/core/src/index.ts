export {
  BANDS,
  BIN_COUNT,
  FEATURE_SOURCES,
  HISTORY_SECONDS,
  SILENCE,
  WAVE_POINTS,
  WAVE_SECONDS,
  bandEnergy,
  historyTimes,
  level,
  logBins,
  rms,
  sampleBins,
  segmentedLevel,
  silentAnalyzer,
  soft,
  spectrumFeatures,
  waveSlice,
  type AudioAnalyzer,
  type AudioFeatures,
  type FeatureSource,
  type Pcm,
  type Spectrum,
  type Wave,
} from './audio.ts';
export {
  BPM_RANGE,
  HOP_SECONDS,
  beatOffset,
  detectSections,
  envelope,
  estimateBpm,
  nearestBeat,
  snapToBeats,
  summarizeEnvelope,
  travelAt,
  travelOf,
  TRAVEL_STEP,
  type DraftAnnotation,
  type Envelope,
  type SectionOptions,
  type SetEnvelope,
  type SetTravel,
} from './analysis.ts';
export {
  OutputSchema,
  PANEL_DEFAULTS,
  PanelSchema,
  ProjectConfigSchema,
  type ExportProfile,
  type GraphicsBackend,
  type HardwareAcceleration,
  type ProjectConfig,
  type ProjectConfigInput,
  type VideoBitrate,
  type X264Preset,
} from './config.ts';
export { TimeSchema } from './time-schema.ts';
export { normalizeMix, compileMix, readMixDocument, mixWarnings } from './mix.ts';
export {
  MixInputSchema,
  MixTimeSchema,
  microseconds,
  ANNOTATION_KINDS,
  SECTION_KINDS,
  type MixDocument,
  type MixAuthoring,
  type Annotation,
  type Play,
  type Recording,
  type Contribution,
  type Listing,
  type FocusDirective,
  type EvidenceSource,
  type Scope,
  type Origin,
  type SectionKind,
} from './mix-schema.ts';
export { importers } from './importers/index.ts';
export { cueImporter } from './importers/cue.ts';
export { plainImporter, type Importer, type ImportedPlay } from './importers/plain.ts';
export {
  CURVES,
  ModPatchSchema,
  ModRouteSchema,
  TIMELINE_SOURCES,
  evaluateModulation,
  evaluateRoute,
  modulationVars,
  type Curve,
  type ModContext,
  type ModRoute,
  type ModRouteInput,
  type ModSource,
  type TimelineSource,
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
export type { ResolvedProject, ResolvedLiveProject, SceneProject } from './project.ts';
export type { Theme } from './theme.ts';
export { Registry } from './registry.ts';
export {
  SECONDS_CAP,
  beatVars,
  readsTravel,
  stageData,
  stageVars,
  playVars,
  tracklistRowVars,
  tracklistVars,
  travelVars,
} from './stage.ts';
export {
  TRACKLIST_DEFAULTS,
  TRACKLIST_GLIDE_SECONDS,
  TracklistSchema,
  TracklistCountsSchema,
  resolveTracklist,
  tracklistView,
  type TracklistInput,
  type TracklistRow,
  type TracklistRowState,
  type TracklistView,
  type TracklistCounts,
  type TracklistCountsInput,
} from './tracklist.ts';
export { lightLayers, type LightOptions } from './lights.ts';
export {
  heightAt,
  reliefField,
  spectrumBand,
  spectrumLift,
  type ReliefField,
  type SpectrumBand,
} from './ridgeline.ts';
export {
  REFERENCE_LUMA,
  artBehind,
  backgroundKind,
  backgroundVars,
  backgroundWarnings,
  coverCrop,
  currentBackground,
  enlargement,
  measureBackground,
  resolveFit,
  type ArtBehind,
  type ArtGrid,
  type BackgroundFit,
  type BackgroundStats,
  type CalmAnchor,
  type CalmArea,
  type FrameArea,
  type FramePoint,
  type MeasuredArt,
  type Size,
} from './background.ts';
export { formatChapterTime, formatTime, formatTimecode, hms, parseTime } from './time.ts';
export {
  Timeline,
  lastAnnotations,
  nextAnnotations,
  sinceAnnotation,
  untilAnnotation,
  type MixState,
  type CurrentPlay,
  type ContributionRun,
  type Section,
} from './timeline.ts';
export {
  MIN_CHAPTERS,
  MIN_CHAPTER_SECONDS,
  chapterList,
  chapterProblems,
  chapters,
  youtubeDescription,
  type Chapter,
} from './chapters.ts';
export {
  BloomConfigSchema,
  FieldConfigSchema,
  MetersConfigSchema,
  OscilloscopeConfigSchema,
  OverviewConfigSchema,
  RadialConfigSchema,
  RidgelineConfigSchema,
  SpectrogramConfigSchema,
  SpectrumConfigSchema,
  VectorscopeConfigSchema,
  drawsWholeSet,
  resolveVisualizerConfig,
  resolveVisualizerConfigs,
  visualizers,
  type BloomConfig,
  type FieldConfig,
  type MetersConfig,
  type OscilloscopeConfig,
  type OverviewConfig,
  type RadialConfig,
  type RidgelineConfig,
  type SpectrogramConfig,
  type SpectrumConfig,
  type VectorscopeConfig,
  type VisualizerConfig,
  type VisualizerInput,
  type VisualizerSpec,
} from './visualizers.ts';

export { pcmAnalyzer, coversPcmLookback, type PcmWindow } from './pcm.ts';
export { FFT_SIZE } from './spectrum.ts';
export { framesWithinMix } from './frame-time.ts';

export {
  resolveFrameRange,
  splitFrameRange,
  resolveChunkSeconds,
  type FrameRange,
} from './render-range.ts';

export type {
  EncodingOptions,
  Exporter,
  RenderStage,
  RenderReport,
  RenderProgress,
  RenderOptions,
  RenderResult,
  StillOptions,
  StillResult,
} from './export.ts';

export { LiveConfigSchema, type LiveConfig } from './live.ts';
export { SceneSelectionSchema, type SceneSelection } from './scene-selection.ts';
export {
  SessionHeaderSchema,
  SessionEventSchema,
  readSession,
  replayEvents,
  type SessionHeader,
  type SessionEvent,
} from './session.ts';

export {
  PerformanceSchema,
  PerformanceRampSchema,
  PerformanceEventSchema,
  AutomationSchema,
  DEFAULT_PERFORMANCE,
  performanceAt,
  rampAt,
  performanceAnalyzer,
  nextBar,
  type PerformanceState,
  type PerformanceEvent,
} from './performance.ts';
