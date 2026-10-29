# Setcast – agent guide

Setcast is an event-driven visual engine for DJ sets. It turns a recorded set (audio file +
tracklist + background art) into a broadcast-quality MP4 for YouTube: a themeable, CSS-styled UI
with a frosted-glass "now playing" panel, deck indicators, and audio-reactive spectral
visualization. Default aesthetic: dark, sterile sci-fi / rusty tech (neurofunk, techstep, jungle).
Credited intervals and musical annotations share a finite mix timeline. A future live mode can use the same
components rendering as an OBS browser-source overlay during Twitch streams, driven by real-time
events from DJ hardware, recording an event log that regenerates the polished VOD afterward
("stream once, publish twice"). Live audio visualization is available through `setcast live`; hardware events are not built yet. A manual session journal can regenerate a finite replay from a separately recorded master.

This project is engineered agentically. This file is the map. Read it fully before changing
anything; update it when you make a non-obvious choice (Decisions) or discover a gotcha.

## Quick orientation

```
packages/core               @setcast/core – event timeline, schemas, RenderFrame contract,
                            hooks, interpolate/spring, media wrappers, modulation, analysis,
                            registry, importers, project loading (node entry), built-in components
packages/renderer-remotion  @setcast/renderer-remotion – the ONLY package that imports Remotion
packages/renderer-browser   @setcast/renderer-browser – recorded/live players and opt-in offline export
packages/cli                @setcast/cli – the `setcast` binary; thin; owns terminal UX
packages/themes             @setcast/themes – built-in themes, their shared fonts/ and textures/
examples/demo               runnable demo project (setcast.yaml, generated audio, background)
scripts/                    repo tasks: smoke render, Remotion-ban check, demo asset generation
```

Entry points of `@setcast/core`:

- `@setcast/core` – isomorphic, pure: mix schemas, timeline, motion, modulation, audio types,
  config schema, importers, registry. No `node:*` imports, no React.
- `@setcast/core/react` – React: `RenderFrame` context + hooks, `Img`/`Video`/`useAsset`,
  built-in components (`Stage`, `Background`, `NowPlaying`, `Spectrum`), visualizer registry.
- `@setcast/core/media` – Mediabunny URL probes for browser or Node; no React or `node:*` imports.
- `@setcast/core/node` – Node only: `loadProject(dir)`, theme/CSS resolution, audio decoding,
  error formatting.

Inside `packages/core/src`, modules are grouped by domain: `mix/` (schemas, normalization,
timeline, tracklist, chapters), `audio/` (PCM, FFT, features, analysis, beats), `live/` (live
config, journal, sequence, MIDI, performance, projection, test pattern), `export/`,
`diagnostics/` (renderer capabilities, compatibility, diagnostics, configuration schemas),
`importers/`, `react/` and `node/`. Project, theme, modulation, motion and visual helpers stay
at the top level. Other packages import only the entry points.

Packages point `exports` at `src/*.ts`; Node 26 runs TypeScript sources directly (type stripping),
so there is no build step in development. `vp pack` builds `dist/` for publishing
(`publishConfig.exports`). Do not reintroduce a dev build step.

## Glossary

One term per concept, in code, docs and messages. Do not reintroduce the retired synonyms.

- **play**: one identifiable use of a recording in the mix (`plays:`).
- **contribution**: an interval in which a play is heard; adjacent contributions form a **run**.
  Not "interval" or "segment".
- **listing**: a play's editorial position in the tracklist (`at`), separate from when it is heard.
- **annotation**: a timed mark on the mix timeline (`annotations:`: drop, breakdown, buildup,
  section_end, rewind, technique, note or a namespaced kind). Not "cue" or "event". A journal `cue` line is the live record
  of one and replays into an annotation; a DJ's hardware cue point is unrelated.
- **focus pin**: a `focus:` entry that holds a run in focus. Not "directive".
- **scene**: saved appearance (`SceneAppearance`: title, art, theme, CSS, visualizers,
  modulation, tempo, branding). A saved scene is a `saved-scene-*` directory.
- **performance**: the live output levels, intensity and brightness, and their timed ramps
  (`performance.ts`). Not the live session as a whole.
- **live session**: an open-ended `setcast live` run, with no recorded file or finite mix.
- **session journal**: the JSONL record of a live session (`journal.ts`).
- **render session**: one browser and bundle shared by several exports (`withRenderSession`).

## Workflow

Prerequisites: the standalone `vp` binary (see Gotchas below), Node 26.7.0
(`.node-version`; `mise` and `vp env` both honor it), ffmpeg optional (smoke frame check).

```
vp install                 # install workspace (pnpm under the hood)
vp check                   # oxfmt + oxlint + type check (tsgo). Must be green. `vp check --fix`
vp test                    # vitest, all packages, from the root
vp run demo-assets         # synthesize examples/demo audio (gitignored, deterministic)
vp run smoke               # renders 3 s of the demo and validates the MP4 (audio + motion)
vp run ban-check           # proves no Remotion in plugin-facing dependency graphs
vp run package-smoke       # build local tarballs; test installed CLI, all themes and video
vp run export-acceptance   # requires ffmpeg + ffprobe; export timing, assets, themes, recovery
vp run theme-stills [dir] [--at 1:51]   # one still per built-in theme + a contact sheet
vp run tracklist-stills [--theme name]  # each theme's tracklist: playlist, DJ, glide, portrait, no panels
vp run branding-stills [--theme name]   # each theme's branding: corners, backdrop, ident, portrait
vp run render-bench [dir] [--help]     # compare render settings; timings and MP4s in out/bench
vp run ready               # check + test + ban-check + smoke (baseline CI checks)
cd examples/demo && vp run render [--range 1:00-1:10]      # full render / slice
cd examples/demo && vp run preview                          # Remotion Studio
node packages/cli/bin/setcast.js play examples/demo          # browser playback prototype
node packages/cli/bin/setcast.js live examples/live          # live audio visualization
```

`vp <name>` runs a built-in; `vp run <name>` runs a package script or `vite.config.ts` task.
Inner loop for an agent: `vp check && vp test`.
For theme work, `vp run theme-stills --at 1:50.4 --theme <name>` renders a moment of examples/demo
into `examples/demo/out/themes/` in about 4 s per still; read the images before committing.
`vp run tracklist-stills --theme <name>` does the same for the tracklist with a ten-listing mix,
including a DJ blend with a tease and an unlisted loop, and `panel: false`.
A theme must also hold up over the user's own art; read "Themes and the user's art" below first.

Before you finish a larger piece of work (a feature, a refactor, a theme, any change across several
files) or commit it, run `vp run ready` and read the result. It runs check, tests, ban-check and the
smoke render in about a minute; run `vp run demo-assets` first on a fresh checkout. If it fails, fix
the failure or report it with its output. Do not call the work done while it fails. `vp run ready`
runs CI's baseline checks (`.github/workflows/ci.yml`), minus asset generation. CI also runs
`vp run export-acceptance`; run it for exporter or media/readiness changes. Do not rely on CI to
catch a failure: nobody noticed CI failing on every push for a month.

Gotchas:

- Renderer benchmarks must load projects through public core/node and theme entry points, not
  CLI source helpers. Remotion's declaration build includes `bench`; importing CLI source from a
  benchmark can emit `.d.ts` files into `packages/cli/src` and break the next formatting check.

- The live-audio cache-limit test makes 2,100 distinct queries, each materializing four FFTs.
  It has a local 30 s timeout: the default 5 s failed on GitHub's Ubuntu runner at 9.3 s even
  though it passed locally. Keep its full cache-overflow coverage and its timeout local.
- `vp` must be the **standalone binary**, not the `vite-plus` npm package installed globally. Get
  it from `curl -fsSL https://vite.plus | bash`, or from mise with
  `mise use -g github:voidzero-dev/vite-plus` (the same release artifact; mise's own registry entry
  for `vp` points at `npm:vite-plus`, which is the wrong one). The standalone binary delegates to
  the project's local `vite-plus`; a globally installed npm copy runs its own Vitest instead. Test
  files import `describe`/`test` from `vite-plus/test`, which always resolves through the project's
  `node_modules`, so the two copies split Vitest's runner state and every test file fails at the
  first `describe` with `TypeError: Cannot read properties of undefined (reading 'config')`.
  `vp check` still passes, which makes it look like a code problem rather than a toolchain one.
  No repo change fixes this (a `vitest` override in `pnpm-workspace.yaml` does not help).
  `./node_modules/.bin/vp` always works and is the quickest way to confirm the diagnosis.
- Chrome Headless Shell (~100 MB) and the webpack cache live under
  `packages/renderer-remotion/node_modules/.remotion` and `.cache/webpack` (`render()` chdirs to
  the adapter package so every project shares them). Delete those to force a fresh download/bundle.
- Remotion Studio's visual mode rejects unknown `<img>` attributes on `<Img>` (it throws
  `No "src" prop was passed to <Img>`). The adapter passes `src`, `className`, `style` explicitly;
  keep `MediaProps` that small.
- To debug the scene in Studio headlessly: start `BROWSER=none vp run preview --port 3111` in
  examples/demo, then drive `openBrowser('chrome')` from `@remotion/renderer` at
  `http://localhost:3111/setcast` and log `onBrowserLog`. Without `BROWSER=none`, Studio opens a
  window in the user's own browser. Stop it with SIGINT or SIGTERM to the `setcast` process;
  Studio stops with it.
- A theme's `@container (aspect-ratio < 1)` block cannot restyle the stage root, because an
  element never matches its own container query. The root's `::before`/`::after` and every
  descendant do match, so portrait overrides go there. A custom property derived from another
  (`--rise: calc(100cqw * tan(var(--angle)))`) is computed where it is declared, so a theme that
  changes `--angle` for portrait declares both on those elements (see escapement).
- A regular high-contrast pattern over the whole frame (a halftone dot screen, fine stripes) is
  hard to watch: the eye cannot settle on it, and at about 10–20 px per period on a 1080p frame
  it sits where visual strain peaks. Give textures an irregular structure, low contrast or low
  coverage (pirate's toner dust, not a dot grid).
- A theme variable must not reuse the name of a variable the stage sets inline (`--bar`, `--beat`,
  `--since-*`, `--travel-*`, `--bg-*`, …): the inline value overrides the theme's rule on the root, and every
  use of it breaks without an error. Anamorphic calls its bar height `--matte` for that reason.
- Chrome does not repaint the contents of a composited element (one with `backdrop-filter`, for
  example) when layout moves it by a fraction of a pixel (crbug.com/833083). Its text stays where
  it was last painted, and glyphs snap to whole pixels, so the text can sit 1 px off. Each render
  tab has its own paint history, so the text jumps 1 px on the frames of one tab: sterile-tech's
  credits jumped about every fifth frame. base.css therefore moves DJ slots in whole pixels, and
  the stage stays hidden until its art is measured, because `data-bg-calm` moves the layout and
  fonts may load before or after it. A theme that moves a composited element through layout moves
  it in whole pixels. A still renders in one tab and cannot show this; compare a slice at the
  default `--concurrency` with `--concurrency 1`, frame by frame.
- A full-frame `backdrop-filter` roughly triples render time (a 6 s slice: 43 s against 14 s
  without it). Keep backdrop blur on small elements such as the panel.
- A visualizer's `<svg>` is a replaced element: absolutely positioned with `width: auto`, it
  keeps its own width and ignores `right`. To span from `left` to `right`, add
  `justify-self: stretch` (bristol's overview). The spectrogram's `<canvas>` is one too: with
  `height: auto` between `top` and `bottom` it stays 150 px tall, so give it a `height`.
- base.css styles the tracklist in `@layer fallback`, so a theme that never styles it still shows
  it in its own type. Any theme rule wins over the layer whatever its specificity, but the
  properties a theme leaves unset still apply: rows are `display: flex` with `line-height: 1.6`,
  `white-space: nowrap` and an opacity, and `.sc-tracklist-time` is `display: none`. A `gap` there
  once leaked into sterile-tech's grid as `row-gap`. Set what the design depends on. A row's height
  follows `--row-presence`, but it cannot shrink below its padding and border, so the leaving row
  jumps out on the glide's last frame unless the theme scales those by `--row-presence`. A flex
  container around the rows keeps leaving rows at full height (Chrome ignores `calc-size()` on
  flex items). An ellipsis needs a clipped title: use `overflow: clip` with
  `overflow-clip-margin`, because `overflow: hidden` also cuts the dot of Ż and a title's glow.
- `vp run render --range 0:30-0:45` passes flags through; do not insert `--` (it becomes a
  positional `dir` argument).
- Audio feature gains (`spectrumFeatures`, `logBins`) are calibrated against the demo synth. Real
  masters are louder in the highs; the `gain` knobs on visualizers and `range` on routes are the
  user-facing correction. Re-calibrate with a script like the bootstrap session's `calib.ts`
  (read the WAV, call Remotion's `getVisualization`, print band energies).

The browser exporter prototype now implements the planned alternative below. `renderer: browser`
and offline-command `--renderer browser` opt in; Remotion remains the default. The historical
v1-only selection wording below is superseded by this explicit choice. See `docs/browser-renderer.md`.

## Renderer independence (in force, verbatim)

Setcast v1.0 renders with Remotion and is architected so that Remotion is entirely replaceable. A
FOSS renderer (Playwright + pinned Chromium + FFmpeg subprocess) is a planned alternative. The seam
exists from day one because it cannot be retrofitted after community plugins exist.

1. **No package outside the renderer adapter may import Remotion.** Not core, not CLI, not themes,
   and above all not plugins. Enforced mechanically: the Oxlint `no-restricted-imports` rule in
   `vite.config.ts` bans `remotion`, `remotion/*`, `@remotion/*` everywhere except
   `packages/renderer-remotion`, and `vp run ban-check` walks the dependency graphs of
   `@setcast/core` and `@setcast/themes` and fails if any Remotion package appears. A seam
   maintained by discipline decays; a seam maintained by the linter doesn't.
2. **Setcast owns time.** The public contract is the Setcast-owned `RenderFrame`:
   `{ frame, fps, timeSeconds, audio: AudioFeatures, mix: MixState, composition:
CompositionState, modulation }`. Components consume it via Setcast hooks: `useFrame`, `useTime`,
   `useAudioFeatures`, `useMixState`, `useModulation`, plus Setcast-owned `interpolate`, `spring`,
   `ease`, `impulse`, `rampUp` (thin math in `packages/core/src/motion.ts`; never re-export
   Remotion's). The Remotion adapter translates `useCurrentFrame()` into a `RenderFrame` at the
   composition root; a future renderer feeds the identical `RenderFrame` from its own loop.
3. **Media goes through Setcast wrappers.** Plugins use `Img`, `Video`, and `useAsset()` from
   `@setcast/core/react` ("this frame isn't ready until the asset is"). `Img` holds the frame
   itself, through `useAsset`, so the guarantee holds under any binding instead of depending on
   Remotion's `<Img>`. The adapter binds them via
   `RendererBindings` (`hold(label) => release`) mapped to Remotion's `delayRender`/`continueRender`
   today, to a frame-ready handshake in a future renderer.
4. **Time-sensitive state is explicit, CSS owns appearance.** Never rely on the browser being
   "3.2 s into a CSS animation". Motion values resolve from `RenderFrame` in code and flow to CSS via
   custom properties (`style={{ '--bg-drift': drift }}`). CSS keeps full power over layout, appearance,
   and transitions of appearance. That is a product value, not an implementation detail.
5. **Remotion is a dependency of the adapter only** (peer dependency there), so `@setcast/core` and
   every plugin are pure-MIT artifacts with no source-available code in their tree. Renderer
   selection is plain config (`renderer: remotion`; the only value in v1). Never gate or detect who
   the user is; the README notes neutrally that Remotion has its own license terms, with a link.

## Architecture

Assisted beat evidence is a pure core capability: `BeatTracker.push({hop,value})` consumes
ordered absolute 100 Hz onset samples, retains 800 values and never applies tempo. The live
adapter owns stereo energy extraction and explicit operator adoption. `beatTracking.range`
supplies initial detector settings; saved scenes omit it. See `docs/live-beat-tracking.md`.

### Finite mix timeline

`mix-schema.ts` defines strict authoring and normalized schemas; `mix.ts` normalizes authoring
against the probed duration and `mix-validation.ts` validates references and temporal rules.
`timeline.ts` indexes a document revision for deterministic queries. The normative contract is
`docs/dj-mix-model.md`; `docs/theme-plugin-contract.md` documents the concrete APIs and CSS.

`plays:` rows describe independently identifiable uses of recordings. Inline metadata creates a
recording per play, or `recording:` references `recordings:`. `at` is an editorial listing and
supplies fallback participation until the next strictly later listing or mix end. `until`
refines that fallback; explicit `contributions: [{from, until}]` replaces it without moving the
listing. Unlisted overlays never truncate fallback credits. Tied listings create concurrent
credits. Decks, parts, tags and positive `tail: true` are optional interval metadata.

Times normalize once to safe integer microseconds. Intervals are finite and half open. Adjacent
intervals within a play form one uninterrupted run; only a positive gap resets entrance dwell,
local sections and focus pins. `Timeline.at(seconds)` rejects queries outside `[0, duration)`.
It exposes all current plays, ordered focus, separate counts, local and mix sections, active
annotation spans, next run entrances (including returns) and next editorial listings.

`annotations:` use `at`, `kind`, optional `scope: {plays: [...]}` (otherwise mix) and mix-only
`participants`. Section kinds are drop, breakdown and buildup; section_end clears a section.
Only a mix drop with participants also establishes local drops. Rewinds do not change membership.
Same-time writes to a section conflict. Scoped last/next helpers return timestamp groups, never
hide tied moments. `lastAnnotations(state, kind, {play: id})` queries a play; omitted scope is mix.

`focus:` pins current runs; pins expire independently and do not resurrect on return. Automatic
focus selects the latest non-tail run, with input order breaking ties. Tags are descriptive.
`presentation.mode: auto` selects DJ layout project-wide if any credits overlap. Explicit
playlist/dj mode never changes normalization. Chapters follow grouped listings, unless an explicit
`chapters:` list replaces them; an empty list disables output.

### Modulation matrix

`packages/core/src/modulation.ts`. Routes: `{ source, target, scope, range, curve, smooth, window, when }`.
Sources are all 0..1 and come in three kinds: audio (`bass | mids | highs | rms | onset`),
timeline (`since:<event>` / `until:<event>` for every built-in annotation kind) and tempo (`beat | bar`: 1 on
the beat or the bar's downbeat, falling to 0 before the next; 0 when the project has no `bpm:`). Target names are kebab-case and
become CSS custom properties `--mod-<target>` on the stage root, so themes consume any modulation
without JS. `range: [a, b]` maps source 0..1 to a..b; `curve`: `linear | sqrt | pow2 | pow3 |
smooth`; `smooth` seconds of trailing recency-weighted average, audio sources only
(frame-independent: it re-samples the audio analyzer at earlier times, no state across frames);
`window` seconds over which a timeline source ramps, so `since:drop` with `window: 4` is 1 at the
drop and 0 four seconds later, and `until:drop` climbs to 1 as the drop approaches and releases
when it lands; `when: drop` applies a route during that section (rests at `range[0]` otherwise).
`scope: mix` routes write stage variables; `scope: play` routes evaluate local cues and sections
for each current panel. Audio still comes from the master. Later routes override earlier routes
with the same scope and target; a theme ships a default patch (`ModRouteInput`,
so defaults may be omitted; `loadProject` runs it through `ModPatchSchema`), the project's
`modulation:` list is appended after it.

### RenderFrame and hooks

`packages/core/src/react/frame.tsx`. `RenderFrame = { frame, fps, timeSeconds, audio, analyzer,
mix, composition, modulation }`. `CompositionState = { width, height, durationSeconds, project }`
where `project` is the `ResolvedProject` (everything the CLI resolved: title, mix document, theme
CSS, visualizer config, asset paths). Hooks: `useFrame`, `useTime`, `useAudioFeatures`,
`useAudioHistory`, `useMixState`, `useModulation`, `useComposition`. The adapter wraps the scene
in `<FrameProvider frame={...}>`.

`useAudioHistory(seconds, count)` returns `{ time, audio }` at `count` moments over the last
`seconds`, oldest first, read from `analyzer`. The moments sit on a fixed grid (`historyTimes`), so
consecutive frames share all but the newest and the analyzer's cache measures one new moment per
frame. A renderer guarantees `HISTORY_SECONDS` (8) of lookback: the Remotion adapter holds a frame
(`useHoldWhile`) until both channels hold the audio from `HISTORY_SECONDS` before it
(`coversLookback`), because `useWindowedAudioData` loads the previous 10 s window after the
current one, and a frame rendered in between would read clamped audio.

### AudioFeatures (the seam)

`packages/core/src/audio/audio.ts`. `AudioFeatures = { bass, mids, highs, rms, onset, bins[64], wave }`,
all 0..1 but `wave`; `bins` are log-spaced and tilt-flattened (raw FFT is bass-heavy). `wave` is
`{ left, right }`, `WAVE_POINTS` (512) signed samples per channel covering the `WAVE_SECONDS`
(1/30 s) that end at the frame, each the mean of the audio it covers (`waveSlice`), for scopes.
The adapter loads the left and right channel with two `useWindowedAudioData` calls (it returns one
channel per call; mono loads once and shares the channel) and holds the first frame until mediabunny has
read the channel count. `AudioAnalyzer =
{ featuresAt(time) }` is what the adapter provides; `featuresFromSpectrum()` turns a linear
magnitude spectrum into features and is pure (tested). Core owns the fixed-reference 2048-point
FFT and PCM analyzer. Remotion translates its decoded windows into that analyzer. Browser playback
and export decode bounded Mediabunny PCM windows; live mode supplies a bounded AudioWorklet ring.
A precomputed sidecar remains an optional optimization after profiling. FFmpeg policy: **subprocess only, never
linked**; keeps MIT Setcast cleanly separate from (L)GPL FFmpeg builds.

### Offline analysis

`packages/core/src/audio/analysis.ts` (isomorphic, pure) reads decoded mono audio into an `Envelope`:
one bass and one high value per ~11.6 ms hop, scaled so the loudest stretch of the set is 1. Two
cascaded one-pole filters at 150 Hz do the band split, so there is no FFT and no dependency.
`detectSections()` reads the bass envelope as loud and quiet stretches with hysteresis and returns
a `drop` where the bass comes in and a `breakdown` where it drops out; `estimateBpm()`
autocorrelates the onset flux over several windows and takes the median, preferring the fastest
lag that still correlates so a 174 BPM roller does not read as 87. `nearestBeat()` folds the onset
flux around a moment by the beat period and reads the grid off where the hits pile up; it is local
(±8 s) so a tempo a tenth of a BPM off cannot drift the grid over an hour. `snapToBeats()` is an explicit helper for callers that choose to move drafts onto it and `estimateBeatOffset()` places the first beat. `setcast analyze` prints detected times without snapping as
a draft `annotations:` block plus `bpm:` and `beatOffset:`, or merges them into `setcast.yaml` with
`--write`.

`readEnvelope()` in `@setcast/core/node` streams PCM into energy hops without retaining the set's
full decoded audio. `decodeMono()` remains available when a caller explicitly needs all PCM. Both use ffmpeg subprocess when it is on PATH
(every format, streamed), and a built-in PCM WAV reader (16/24/32-bit, float) with windowed-sinc resampling otherwise, so a freshly scaffolded
project analyzes without any install. Streaming PCM can support a future AudioFeatures sidecar,
but browser export already works with bounded decoded windows.

### Media wrappers and readiness

`packages/core/src/react/renderer.tsx`. `RendererBindings = { name, Img, Video, hold }`.
`Img`/`Video` are the adapter's components; `Video` also takes `loop`, `muted` and background `fit`; `useAsset(src)` preloads and holds the frame until
loaded; `useFontsReady()` holds until `document.fonts.ready`. The default bindings (no adapter)
are plain `<img>`/`<video>` with a no-op `hold`, used in tests.

### Plugin registry

`packages/core/src/registry.ts`: `Registry<T>` (`add`, `get` with a helpful error listing known
names, `names`). Instances: `importers` (`@setcast/core`), `visualizers` (`@setcast/core/react`).
Each plugin kind is a small interface plus a Zod schema for its config. Extension points (roadmap
list; implemented today: visualizer, theme, tracklist importer):

- visualizers `(RenderFrame, config) → JSX` (spectrum ✓, radial ✓, meters ✓, oscilloscope ✓,
  vectorscope ✓, spectrogram ✓, ridgeline ✓, overview ✓, bloom ✓, field ✓, tunnel ✓,
  constellation ✓); `visualizer:` takes one block
  or a list drawn in order
- themes: CSS variables + fonts + default modulation patch + default visualizers + layout
  (16 built in, listed in the README ✓; a bare `.css` path is also a valid theme)
- tracklist importers: plain "MM:SS Artist - Title" ✓ (`ID - ID` dubs ✓), `.cue` ✓,
  Rekordbox/Serato/Traktor history
- analysis: BPM and drop / breakdown detection → draft mix annotations without automatic snapping
  (`setcast analyze` ✓); downbeat detection is not built
- background engines: static image ✓, looping video ✓, per-play backgrounds ✓
  (`plays[].background`, selected from the first focused play), generative
- layout profiles / output targets: 16:9 ✓, 9:16 vertical ✓ (`@container (aspect-ratio < 1)` in the
  theme; the stage root is a size container), promo clips cut around `drop` events
  (`setcast clip` ✓)
- branding: logo ✓, identity and episode label ✓, rotating messages ✓, timed announcements ✓
  (`branding:`, `announcements:`; `docs/branding.md`); intro/outro cards are saved scenes
- side outputs: YouTube chapters + description from the timeline (`setcast chapters` ✓),
  thumbnail stills (`setcast still` ✓)
- live adapters: Pro DJ Link (prolink-connect), Denon StagelinQ, VirtualDJ OS2L, Serato session
  tail, MIDI/OSC; event-delay offset; convention: a cue named "DROP" becomes a `drop` event
- the live loop: `setcast live` records `event-log.jsonl` → `setcast render` regenerates the VOD

Community naming: `setcast-theme-*`, `setcast-viz-*`, `setcast-adapter-*`, `setcast-import-*`.

### Renderer capability reporting

Core owns `RendererCapabilities`, `RendererName` and `RendererFeature`. Each adapter exports
its descriptor from a lightweight `/capabilities` entry with no runtime dependencies. The CLI's
`setcast capabilities [--renderer browser] [--json]` reads it without a project or browser.
These declarations describe Setcast's adapter support, not runtime availability or qualification.
Adapters also export `diagnose(options)` from `/diagnostics`. Core owns versioned report types
and feature readiness; core/node supplies shared probe/report helpers. The CLI's `doctor` checks
the machine without reading a project or downloading executables. Optional failed checks do not
fail unrelated requested features. Browser uses system FFmpeg, Remotion its packaged binaries;
JPEG/WAV fixtures avoid optional lavfi filters and rawvideo demuxers omitted by Remotion. The
read-only Remotion browser lookup runs in a child because rejecting its download callback poisons
its process-global ensureBrowser queue. Probe helpers evaluated in a browser must be self-contained.
See docs/renderer-diagnostics.md.

### Configuration tooling

`configurationSchema(kind)` in core generates draft-2020-12 input schemas for project, live,
visualizer, venue, test-pattern and MIDI profile authoring. `setcast schema [kind]` prints them without loading
projects or renderers. Derive alternatives from the visualizer registry, requiring an explicit
name for every kind except the existing spectrum default. JSON Schema cannot represent all Zod
refinements or filesystem/timeline checks; retain runtime loading as authoritative. Never use
`unrepresentable: 'any'` to hide unsupported types. Output extension regexes use explicit letter
cases because JSON Schema patterns cannot carry JavaScript regex flags. Ajv is test-only.
`validateProject(dir, options)` in core/node and `setcast validate [dir] [--live] [--json]` reuse
project loaders, probe recorded duration and check direct scene references. Reports are versioned
JSON with root-relative file/key diagnostics; warnings remain nonfatal. Keep source labels such
as mix timeline separate from physical config filenames. Preserve authored paths when realpath
resolves aliases. Recorded CLI validation supplies an adapter capability resolver and checks output settings without
importing rendering libraries. `--renderer` overrides selection for validation only. Core callers
supply `rendererCapabilities(name)` to opt in; reports distinguish unchecked capabilities. Pure
`rendererCompatibility` returns support issues, including CLI hardware fallback warnings, without
applying fallback or probing devices. Live scenes never receive offline renderer checks.
Validation does not render, decode full features, activate nested scene sequences
or scan unused scene-bank entries. Recorded scene ConfigErrors include their preset path.
See docs/configuration-schemas.md for editor association and contract limits.

### Project resolution and orchestration

`setcast.yaml` (schema: `packages/core/src/config.ts`) → `loadProject(dir, {themes, probeDuration})` in
`@setcast/core/node` → `LoadedProject` with the `ResolvedProject` (plain JSON: absolute-free paths
relative to the project dir, merged modulation, theme CSS with fonts inlined as data URIs, base CSS,
visualizer config) and non-fatal configuration warnings. The CLI prints those warnings to stderr.
The core/node audio probe runs during loading, before finite timeline normalization.
`ResolvedProject.envelope` and `ResolvedProject.travel` are null after loading. A visualizer
registered with `wholeSet: true` draws the whole set from the envelope, and CSS that reads
`--travel-*` needs the travel, so the commands that render (`render`, `still`, `clip`, `preview`)
call `withWholeSet` after validating their flags: when `readsWholeSet(project)`, `readWholeSet`
decodes the audio once, `summarizeEnvelope` reduces it to at most 1200 points of bass and high
energy, and `travelOf` sums it into a point every 0.25 s. The renderer adapter receives `ResolvedProject` as input props and nothing
else. Assets referenced
by `setcast.yaml` must live inside the project directory (the adapter serves it as the public dir).

Renderer adapter API (`@setcast/renderer-remotion`): `render(project, { projectDir, out, range?,
onProgress })`, `still(project, { projectDir, out, at? })` and `preview(project, { projectDir })`.
Entry file for the bundle: `packages/renderer-remotion/entry/index.tsx` (shipped as source;
Remotion's bundler compiles it).

### CSS contract

The stage root has class `setcast` plus `--mod-*` variables. Stable class names: `sc-stage`,
`sc-bg`, `sc-art`, `sc-panel`, `sc-deck`, `sc-artist`, `sc-title`, `sc-label`, `sc-next`, `sc-spectrum`,
`sc-header`, `sc-clock`, `sc-tracklist`, `sc-brand-identity`, `sc-brand-message`.
`packages/core/css/base.css` is structural only (positions, sizes as variables, and the
tracklist's and branding's fallback looks); themes own appearance. Theme variables: `--panel-bg`, `--panel-border`, `--accent`,
`--accent-2`, `--deck-a` … `--deck-d` (one signal color per deck), `--fg`, `--fg-dim`, `--blur`,
`--radius`, `--font-display`, `--font-mono`. Users can add `css: ./overrides.css` in
`setcast.yaml`; it is appended last.

base.css resolves `--deck` on each panel's optional `data-deck`. A-D keep their theme colors;
arbitrary deck labels are permitted and use the theme accent unless styled explicitly. The stage
has no global deck. It carries `data-presentation`, `data-current-plays`, `data-section`,
`data-shared-drop` and `data-background` (`none`, `image` or `video`: the kind of art the
background shows right now, so a theme can treat art differently or show its own material
without any). For an image it also has `--bg-luma`, `--bg-exposure`, `--bg-color-1`,
`--bg-color-2`, `--bg-aspect`, `--bg-detail`, `--bg-focus-x`, `--bg-focus-y`, `data-bg-calm`, `--bg-calm-luma`
and `--bg-calm-detail` (see Decisions). Its section and cue variables describe the mix.

Each `.sc-panel` has `data-play`, `data-focused`, `data-returning`, optional `data-deck`, local
`data-section`, `data-tail`, and `data-tags`, and with a tracklist `data-listed` (whether the list
shows a row for its play). `--since-entry` and `--until-exit` describe its uninterrupted run;
`--play-order` is the play's input position, a stable seed for per-play variety.
Both stage and panels have scoped `--since-*`/`--until-*` for drop, breakdown, buildup and rewind,
`--drop-intensity`, `--drop-participants` and `--section-time`. Seconds cap at 60. Shaped
`--drop-flash`, `--rewind-flash`, `--tension` recompute locally, avoiding inherited mix cues.
The stage also has `--set-progress`, `--current-plays`, optional `--beat`/`--bar`, and
`--travel-bass`/`--travel-high` when the CSS reads them (`readsTravel`).

`--show` springs in at run start and follows `panel.dwell`/`panel.fade`; metadata changes do not
reset it. Themes use `--presence`, which follows show in playlist mode; in DJ mode it springs in,
holds for the run and eases out over its last 0.6 s, so DJ credits remain legible after dwell.
With a tracklist, a DJ panel whose play has a row in the list follows the dwell instead and hands
the credit to the row (`panelMotion` in `NowPlaying.tsx`); a fully handed-over panel is not
rendered and takes no stack capacity. `panel: false` (`ResolvedProject.panel` null) renders an
empty `.sc-contributors`, so anchors to `--contributors` keep working.
`--presence` sits on the panel's `.sc-slot`. In DJ mode base.css stacks the slots in play order,
anchored at the bottom, each as tall as `--presence` times its panel, so the stack opens and
closes smoothly (`--stack-gap`). The DJ stack is the CSS anchor `--contributors`,
which a theme uses to keep `.sc-next` clear of it. `.sc-contributors` shows up to four panels in
landscape or three in portrait, retains focused plays first, and adds an explicit overflow count
and accessible full list. There is no data-model concurrency limit.

Visualizers are SVG under one root class each, with `data-style` set to the block's `style`:
`.sc-spectrum` (bars are `rect`s in `.sc-spectrum-bars`, and with `peak` their markers are
`rect`s in `.sc-spectrum-peaks`; `style: line` draws `.sc-spectrum-line` over
`.sc-spectrum-area`) and `.sc-radial` (the ring is a `circle`, bars are `line`s; `style: line`
draws `.sc-radial-line` and `.sc-radial-area`, the band between it and the ring). base.css places
them and sizes them with `--spectrum-height` and `--radial-size`. With `fill: art`, a
`.sc-spectrum-art` or `.sc-radial-art` layer after the SVG shows the art through its shapes (the
bars, cells, area, a wedge per radial bar, or the radial band), clipped to them. It holds a copy
of the art the theme shows, placed over it: `.sc-bg-copy` over `.sc-bg-img`, or `.sc-art-copy`
over `.sc-art` when the theme shows that. The SVG still draws, so a theme can paint or glow behind
the art; it styles the art with `.sc-spectrum-art img`. `--radial-size` and
`--vectorscope-size` are set on the stage root, capped by width for portrait; override them there,
not on the element, so the vectorscope stays centered in the ring. The scopes read
`AudioFeatures.wave`: `.sc-oscilloscope` draws `.sc-oscilloscope-line` over a
`.sc-oscilloscope-axis` (`--oscilloscope-height`, `--oscilloscope-bottom`), and `.sc-vectorscope`
draws `.sc-vectorscope-line` over `.sc-vectorscope-grid` (a circle and two axes). With `trail`,
each scope draws the earlier traces first as `.sc-oscilloscope-trail` / `.sc-vectorscope-trail`,
each with `--age` (0..1, the oldest highest); they have no stroke until a theme gives them one.
base.css centers
the vectorscope on the radial ring (`--vectorscope-size`), so the two nest. `.sc-spectrogram` is a
`<canvas>` (`--spectrogram-height`): its CSS `color` paints a full-strength cell and each cell's
alpha is its level, so a theme colors it with `color` and shapes it with opacity, masks, blend
modes and filters. With `fill: art` (`data-fill`) the cells show the art the theme shows instead,
drawn where and how it is drawn (`object-fit`, `object-position`, transforms), or covering the
frame when the theme hides the art; video and a stage without art fall back to `color`. A filter
on the canvas applies to the art too, so a theme corrects its exposure there, and an SVG
`feFuncA` filter reshapes the levels (darkroom's paper grade).

`.sc-ridgeline` (`--ridgeline-height`, the whole frame by default) is a ridgeline plot of the last
`seconds`: one `.sc-ridgeline-line` path per moment, oldest first, each with `--age` (0 for this
frame's line at the bottom, rising to 1 as a line leaves at the top). Each path is closed below
the box, so a `fill` in the ground's color hides the lines behind it; base.css leaves it
`fill: none` with `stroke: currentColor`. The art raises the lines where it is bright, read where
each point sits in the frame, and the spectrum spans `spread` of the width with the bass under
`--bg-focus-x`. With `fill: art` each path's stroke is an inline gradient of the art's colors
along it, so a theme's `stroke` rule does not apply to it; width and opacity still do.

`.sc-overview` is the whole set as a strip under the header (`--overview-top`, `--overview-height`):
`.sc-overview-high` above the middle line and `.sc-overview-bass` below it, the same two again
inside `.sc-overview-played`, clipped to the part that has played, one
`.sc-overview-mark[data-type]` per annotation or listing (`data-type="listing"`) and the `.sc-overview-head` playhead. SVG lines have no
stroke until a theme gives them one, so a theme shows exactly the event types it styles.

`.sc-bloom` is the art's own lights glowing with the music: one `.sc-bloom-light[data-band]` per
band with its level in `--level`, each holding a `.sc-bloom-glow` image of glowing lights placed
over the art the theme shows (`.sc-art` when shown, else `.sc-bg-img`). base.css screens each layer over the art at opacity `--level`; a theme may change
the blend, scale the glow with `filter: brightness()`, or shape the level with `calc()`. The first
band lights the lights nearest the art's first hue and the grey ones, the second those nearest
its second hue.

`.sc-meters` is HTML, not SVG: one `.sc-meter` per band (`data-band="bass"`) with its level in
`--level`, 0..1, holding `.sc-meter-bar` > `.sc-meter-level` and a `.sc-meter-label`. The theme
draws the meter from `--level`; base.css positions it (`--meters-top`, `--meters-height`) and,
when `segments` is not 0 (`data-segmented`), masks `.sc-meter-bar` into `--segments` cells.
With `peak`, each `.sc-meter` also carries `--peak` and its bar holds a `.sc-meter-peak`, which
base.css places as a hairline, or as the lit part of the top cell when segmented.

`.sc-next` shows the next listing group in playlist mode and next contribution-run group in DJ
mode, labelled "Next in tracklist", "Next entry" or "Returning". Its own `--until-next` drives
the theme's visibility. Never infer a next deck from missing hardware information.

`.sc-tracklist` (with `tracklist:`) lists the listings around the current one: a
`.sc-tracklist-heading`, then one `.sc-tracklist-row` per listing in `.sc-tracklist-rows`, holding
`.sc-tracklist-index`, `.sc-tracklist-time` (on the display clock), `.sc-tracklist-artist` when
known, `.sc-tracklist-title` and `.sc-tracklist-label` (label and version) when known; base.css
hides the time and the label. A row's `data-state` is `current` while its play contributes,
otherwise `played` or `upcoming`; it also has `data-play`, `data-focused`, `data-returning`, the
current contribution's `data-deck`, and `data-ahead` while its listing time is still to come.
A current row also has its contribution's `data-tail` and `data-tags` and its run's
`--since-entry` and `--until-exit`. `--row-offset` is its distance in rows from the current
listing group, fractional while the list glides to a new one (`TRACKLIST_GLIDE_SECONDS`, 0.8);
`--row-presence` (0..1) is how far inside the window it is, and base.css sets each row's height
to it, so the list scrolls as the leaving row closes and the entering one opens; `--row-progress`
runs 0..1 through its listing span. The root has `--since-listing` and `--until-listing` and is
measured like the panels. base.css positions it (`--tracklist-top`, `--tracklist-width`) and
aligns a leaving row's content to its bottom, so it scrolls out of the top. With a tracklist, the
stage renders it in place of `.sc-next`, after the panels, so it can anchor to `--contributors`.

`.sc-brand-identity` (logo, name, event, episode) and `.sc-brand-message` (rotating messages or
an announcement, `data-kind`, `--message-presence`) take `data-position`, one of nine frame
areas, and sit at `z-index: 4`, inset by `--brand-top`/`-right`/`-bottom`/`-left`. Each built-in
theme sets those insets so the defaults (identity top right, messages bottom center) clear its
furniture; set them on `.setcast.theme-<name>` (base.css's `:has(> .sc-header)` rule otherwise
wins) and portrait values on the branding elements. Light-ground themes set `--brand-halo` and
`--brand-plate`. Details: `docs/theme-plugin-contract.md#branding`.

### Themes and the user's art

Users replace the demo art with their own: usually a dark drum and bass sleeve, often a bright,
saturated or busy image from DeviantArt, at any size and shape. A theme tuned only on the demo's
nearly black, flat `bg.png` breaks on such art. When you build or change a theme, use these tools
(details in `docs/theme-plugin-contract.md`):

- `data-background` (`none`, `image`, `video`) on the stage: style a set without art, or with a
  video, on its own terms.
- Exposure correction: start the `.sc-bg-img` filter with
  `brightness(pow(var(--bg-exposure, 1), var(--bg-correction, <default>)))`, or the `--art-luma`
  form when the treatment shows art best at another brightness. The default strength sits in the
  `--bg-correction` fallback so users can override it.
- `--bg-color-1` and `--bg-color-2`, the art's hues: derive the theme's own variables from them
  with `oklch(from …)` at the theme's lightness and chroma, and use `var(--bg-accent, <own color>)`.
- `--bg-luma-behind` on `.sc-header`, `.sc-set-title`, `.sc-clock`, each `.sc-panel`, `.sc-next`
  and `.sc-tracklist`: how bright the art is behind that element, every frame. Scale a text shadow
  or a plate's opacity with it, so text stays legible over a bright sky without changing the look
  over dark art. Multiply it by the theme's correction gain, declare derived variables on the measured
  element itself, and never size or position anything with it. sterile-tech's `--art-gain`,
  `--glare` and `--veil` (the larger of glare and busyness from `--bg-detail-behind`) are the
  reference.
- `--bg-detail-behind` on the same elements: how busy the art is behind it. Brightness alone
  misses a dense pattern of moderate luma (psychedelic art), which needs a plate as much as a
  bright sky does. `--bg-detail` is the same for the whole art.
- `data-bg-calm` on the stage names the candidate text area with the least detail (`top-left`,
  `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`; `top` and `bottom`
  in portrait), with `--bg-calm-luma` and `--bg-calm-detail` measured over it. A theme can set its
  type where the art is empty and choose its ink from the area's luma. `--bg-focus-x` and
  `--bg-focus-y` are where the subject is, for a crop or a zoom that keeps it in frame.

Art of another shape reaches `.sc-bg-img` as one frame-sized image (`backgroundFit`), so no theme
rule needs to handle it. A theme that shows the art as an object, a print or a sleeve, shows
`.sc-art` instead: the file at its own shape, hidden by default, sized with `--bg-aspect`. Verify over real art, not only the demo: `setcast still --theme all` on a
project with the art, or `node demos/backgrounds/sheet.mjs` over the local test images when
`demos/backgrounds/` exists (gitignored; never commit those images). Check legibility once more
with `.setcast { --bg-correction: 0; }`, because users can turn the correction off.

## Roadmap (beyond v1)

- The active renderer replacement sequence is `docs/renderer-replacement-plan.md`: comparative
  benchmarks, direct video frames, capture without image compression, scheduling/hardware encoding,
  persistent reuse, unified preview/export, fidelity and independent distribution. This is planned
  work, not implemented support. Keep Remotion default until the documented release criteria pass.
- Qualify and optimize the opt-in browser exporter across platforms and real projects. It uses
  bounded PCM windows; a full AudioFeatures sidecar is not a prerequisite.
- Optional AudioFeatures sidecar/cache, justified by measured decode cost and reuse.
- Live hardware adapters, physical latency/OBS qualification, drift correction and live cue
  presentation. Manual journal → finite replay and live audio visualization are implemented.
- Everything in the plugin registry list above.
- Generated per-project bundle entry so `plugins:` in `setcast.yaml` can pull npm plugins in.

## Decisions

- Browser H.264 capture is sRGB. Declare full-range BT.601/JPEG matrix separately from BT.709/sRGB
  primaries and sRGB transfer with the adapter's SCREENSHOT_COLOR_FILTER before encoding. Matrix
  metadata alone previously made Chromium playback shift saturated colors. Keep software/hardware
  preflight and doctor on the same filter; do not replace metadata declaration with an unqualified
  range or transfer conversion. See docs/renderer-color.md and bench/color.ts.

- Independent preview plays the master through the existing `Transport` while requesting absolute
  frames from the export driver. Audio-clock requests may skip frames; the queue remains one active
  plus one latest pending request and reports completed frames during playback. Pause/seek settles
  an exact frame. Silent sequence inspection remains available after playback-media failure. Stop
  and remove audio on reload/retry; preserve the latest requested frame in the workspace parent.
  Throttle continuous history writes rather than updating the URL at frame rate. Physical output
  latency and routing are separate from browser-clock validation.

- Persistent browser export reuse is opt-in through `render --cache <directory>` (default 2 GiB,
  `--cache-size` in MiB), separate from `--resume`. Cache identity initially includes the complete
  project/settings/runtime/host and all tracked assets. Only destination-path changes can reuse
  without changing that identity; project edits invalidate conservatively. Store validated encoded
  video chunks, verify copied hashes, keep one writer lock, bound video bytes/entry count, and use
  `cache inspect`/`cache clear` for management. Never recursively clear unrecognized directories.
  Cache hits still prepare runtime identity and re-encode continuous audio; zero capture pages is
  the initial repeated-export benefit. See `docs/browser-renderer.md` for limits.

- Browser hardware encoding uses system FFmpeg: VideoToolbox on macOS, NVENC on Linux/Windows.
  Probe a real frame before capture, using project dimensions/FPS/bitrate when available. Required
  hardware must not silently use software (`-allow_sw 0` on VideoToolbox); optional failure reports
  a reason and selects libx264. Resolve this before resume identity, and never switch encoders
  inside a job. VideoToolbox passed local acceptance/resume on M1 Pro; NVENC device qualification
  remains pending. Capability declarations are not platform qualification.

- Browser export encodes its continuous master soundtrack alongside video preparation/capture.
  Both tasks share cancellation and must settle before temporary files are removed. Assembly
  still waits for both. `audio-encode` measures the soundtrack separately; `mux` now excludes it,
  so historical combined mux timings cannot be compared directly with the new mux-only metric.

- Renderer-replacement discoveries and validation are recorded as work proceeds in
  `docs/renderer-replacement-log.md`. The first direct decoded-canvas candidate is archived under
  `docs/research/video-canvas-2026-10-29`: it failed fidelity checks and increased screenshot cost.
  Production retains the PNG image path. Do not assume removing PNG conversion improves total
  export time; rerun the retained matrix and alternating profiles for a different candidate.

- `RenderOptions.onRuntime` reports observations from active exports without changing default
  render behavior. Keep observations separate from requested options: Remotion can decline
  parallel encoding. Browser identity/GL probes are opt-in and included in benchmark wall time;
  the WebGL renderer string does not measure GPU utilization. `render-compare` report version 2
  and later versions retain these events. Record FFmpeg input format separately from output encoder; an input
  `-vcodec mjpeg` names the decoder. A browser-only probe reports capture as `not-observed`.
  Do not infer inter-chunk overlap from image-sequence encoding alone.

- `vp run render-compare` compares the installed adapters with aligned loading-through-cleanup
  timing and fresh sessions, preserving project output settings. It hashes inputs, decodes outputs
  and retains failed/cancelled reports. System CPU includes concurrent projects; Node RSS is not
  total memory. Report version 3 adds bounded macOS/Linux process-tree sampling, with explicit
  unavailable/partial states; summed RSS can double-count shared pages, and external services
  are not attributable to another project. Runtime observation identifies active paths; the isolated 4.0.539 exercise is
  retained under `docs/research/remotion-539-2026-10-29`. Named POSIX-pool cleanup is not yet
  verified there; intact output and no temporary directories do not prove all-resource cleanup.
  See `docs/render-comparison.md`; do not treat its short harness checks as speed qualification.

- Renderer replacement preserves the full CSS/RenderFrame contract and targets both first-export
  throughput and reuse after successful exports. The plan in `docs/renderer-replacement-plan.md`
  takes priority over broad plugin/effect expansion for this effort. Extend the existing native
  capture feasibility fixtures; retain the documented 4.0.534 encoder-failure regression when
  comparing current upstream. Faster capture is experimental until qualified. The 30% wall-time
  objective is a target, not a measured gain; this documentation changes no runtime defaults.

- Browser WebP stills use native CDP capture at quality 100. Verify the result uses lossless VP8L
  before writing it; do not silently accept a lossy fallback after a browser update. All browser
  still formats work without system FFmpeg. The WebP check compares decoded PNG/WebP pixels
  across themes and GPU visualizers with FFmpeg absent during capture (`bench/webp.ts`).

- `field` is an opt-in WebGL 2 contour visualizer in core/react, shared by live, recorded and
  both offline renderers. Every draw uses absolute time, audio and an explicit seed. It has no
  animation loop, feedback texture or accumulated simulation state. CPU-computed bounded phases
  preserve motion precision in long sessions. CSS `color` supplies its tint and alpha.
  `resolution` scales composition pixels, independently of device pixel density; the drawing
  buffer is capped at 4096 pixels per side and the hardware limit. Preserve the drawing buffer
  across readiness waits. Context creation fails explicitly. Context loss holds readiness for a bounded
  restoration wait and fails on timeout instead of exporting incomplete frames. Dispose GPU programs on unmount and release detached canvas contexts after cleanup,
  allowing React effect replay on a connected canvas. Determinism is qualified within one
  browser/GPU backend, not across drivers. Export acceptance checks repeated stills and decoded
  frame identity between one- and two-worker chunked exports.
- GPU recovery is owned by `ShaderSession`, not capture or scene selection. `recoverySeconds`
  (0–15, default 5) bounds each loss; 0 fails immediately. Rebuild program/uniforms only after
  browser restoration, draw the latest frame/config/scale before releasing the hold, and retain
  the hold until React commits a fatal error. Unmount cancels timers and releases holds. Live
  capture continues, so recovery can leave a temporary empty GPU layer. Optional renderer
  diagnostics go to the private operator notice, never the stage or journal. Public `ShaderCanvas`,
  `Shader<C>`, `Uniforms` and `GpuCanvasConfigSchema` support stateless visualizer authors; `apply`
  only sets uniforms, descriptors are stable, and shaders write premultiplied pixels everywhere.
  The supplied `u_color` is straight RGBA. See docs/gpu-visualizer.md for the full contract.
- `tunnel` and `constellation` share `ShaderCanvas` with `field`: one full-frame fragment
  shader per visualizer, `u_size` and `u_color` supplied, and the same context, readiness,
  context-loss, disposal and `renderScale` handling. Motion is reduced in double precision in
  `gpu-motion.ts` to phases with a period the shader shares (`TUNNEL_RING_PERIOD`,
  `CONSTELLATION_CELL_PERIOD`), so an eight-hour session keeps sub-frame motion. Per-point and
  per-ring randomness uses integer pcg3d hashing, never `fract(sin(x) * k)`, whose result
  depends on the driver's `sin`. The tunnel's twist turns the whole wall about the center;
  twisting only the spokes made them read as unrelated straight lines. The constellation keeps
  each point inside its cell, so the twelve neighbor pairs whose 2x2 block contains a pixel's
  cell are every link that can cross it; keep that invariant when changing orbits. Its flight
  is stateless: three layers cycle through depth by the fractional part of absolute time, and
  each pass gets a new layer id. SwiftShader performance must include screenshot readback;
  readiness can finish while drawing is still in flight. See docs/gpu-visualizer.md. The browser
  check is `node packages/renderer-browser/bench/gpu.ts [name]`; CI runs it.

- Branding (`branding:` in setcast.yaml and live.yaml) is scene-level appearance: saved scenes
  copy the logo and record it, recall restores it like the title, and recorded `scenes:` switch
  it. It is a fixed set of nine frame areas, one size multiplier per element and CSS insets per
  theme edge, not a layout editor. Sizes follow `cqmin`, so portrait keeps the proportions.
  Messages and announcements only fade (`--message-presence`); no slide, scroll or CSS
  animation, because fractional-pixel motion paints differently across render tabs. The rotation
  and announcements are pure functions of absolute frame time (`messageAt`). Announcements are
  mix-timeline events (`announcements:`), not scene state: `seconds` includes both fades, and
  ending one early (`endAnnouncement`) shortens it to fade out from that moment, so live output
  and replay agree. The logo goes through `Img`, so every renderer holds the frame for it, and
  the browser resume fingerprint tracks it. See `docs/branding.md`.
- Live branding edits reuse the scene path: they change the live project, prepare off screen,
  enter the journal as scene snapshots and hold a running sequence, like title edits. Identity
  text applies with one button so typing never reaches the output or the journal. Recall
  restores the scene's branding. Live announcements are session state on the capture clock,
  like performance ramps: `resolveLiveFrame({ announcements })` keeps them out of the project, so
  announcing does not remount the scene. Journal `announcement`/`announcement_end` events replay
  into `announcements:`. MIDI notes 45/46 toggle identity/messages; saved mappings need Reset.
- `setcast render --resume` is browser-only and opt-in. Completed chunks live in
  `<output>.setcast-resume`; a content/runtime fingerprint invalidates stale jobs, and checksum
  validation rejects missing/corrupt chunks. Source metadata is rechecked during capture and
  assembly. Resume blocks untracked resource requests and requires embedded CSS dependencies.
  Chunks are probed with ffprobe, flushed and published through an atomic manifest. The writer
  lock is exclusive; a stale lock requires manual confirmation/removal, never age-based takeover.
  Successful final-output replacement removes checkpoints through a directory rename before
  cleanup, so a new writer cannot enter a directory being deleted. Default exports still use
  temporary files. See `docs/browser-renderer.md` and `bench/resume.ts` in renderer-browser.
- Browser capture/runtime identity hashes the actual Vite bundle and adapter source/distribution
  files, so local iterations invalidate checkpoints even when package versions are unchanged.
  The fingerprint includes host/runtime identity; checkpoints are not a cross-machine cache.
  CI installs pinned Playwright Chromium and runs browser acceptance plus resume recovery.

- Performance values and timestamped ramps belong to core. Intensity scales visual features,
  not input PCM; brightness uses a black overlay outside the theme's `.setcast` element, inside
  an isolated `.sc-output` wrapper. This covers theme pseudo-elements and survives rules that
  hide stage children. Both exporters evaluate ramps at absolute frame time.
- Live automatic sequences are explicitly started lists of saved scene presets and dwell seconds.
  Dwell starts after fade-in and pauses without available input or during blackout. Hold cancels
  pending fetch/queued recall and lets a transition already fading finish. Manual pads/MIDI take
  control; capture restart leaves the sequence held. Effective scenes and ramps use the existing
  journal path. Sequence settings belong to the parent live project and are omitted from snapshots.
- Energy-aware sequencing is opt-in (`sequence.mode: energy`); ordered behavior stays default.
  Scene entries carry low/medium/high/any tags. A 10 Hz pre-performance RMS/bass signal uses
  smoothing, hysteresis and sustained classification. Only dwell expiry may select a matching
  entry, rotating in list order; any is a fallback and no match retains the current scene.
  Input loss/blackout/routing changes reset evidence. Effective recalls use existing journal
  snapshots, not recorded classifier state. See docs/live-performance.md and bench/energy.ts.
- Live projector geometry belongs to the output session. ProjectionSchema validates convex
  normalized corners, source crop and output-space masks; VenueSchema wraps it for import/export.
  Scene and journal snapshots omit projection. The warped scene renders in an iframe to preserve
  untransformed theme/art measurements; RendererBindings.document selects its font readiness.
  Pending stages must stay explicitly hidden inside that document. Capture remains in the parent.
  Calibration follows brightness/blackout and the outer input-loss fallback covers it. Profiles
  load explicitly, exclude the pattern, and persist by origin with JSON backup. See
  docs/projector-setup.md and renderer-browser/bench/projection.ts.
- Camera test patterns share core's TestPatternSchema and explicit-time React TestPattern.
  live.yaml testPattern settings belong to output setup, never saved scenes or journal snapshots.
  Activation is always explicit, and valid preset/venue imports turn it off. The projector's
  alignment control selects the same pattern; direct output supports it too. Patterns render in
  composition coordinates beneath masks/input-loss fallback and receive effective brightness.
  They do not use theme colors, audio analysis or CSS animation. See docs/camera-setup.md.
- Live scene pads recall self-contained `saved-scene-*` projects without changing input routing,
  dimensions, tempo or current performance levels. Transitions fade through black, start on the
  manual bar grid and wait for readiness. Failed scenes retain the previous output and do not
  enter the journal. MIDI ownership stays in the output window when controls move to the popup.
  See `docs/live-performance.md` and `docs/rendering-and-live-roadmap.md`.
- Journal snapshots use `journal-scene-*`, keeping them out of the manual bank. Performance
  ramps use capture-sample timestamps. Appends cache bounded tail metadata and revalidate on
  external changes, avoiding full-log parsing on each fader update. The file limit is 64 MiB.
- MIDI setup belongs to the output session, not scenes or journal snapshots. Core owns the finite
  action/key/profile schemas, decoder and bounded continuous-control buffer. live.yaml midi wins
  at startup; configured sessions never overwrite the unrelated browser profile. Unconfigured
  sessions migrate valid legacy mappings and persist versioned profiles by origin. Mapping object
  replacement clears pending values/button edges. Learn/import/reset share this path; permissions
  and device selection stay explicit. See docs/midi-controls.md and bench/midi.ts.
- Browser export exposes optional timing metrics. Readiness waits for two stable animation-frame
  callbacks, with fonts/images decoded inside the stability loop. Before changing this again,
  run both export acceptance suites and `node packages/renderer-browser/bench/frames.ts`.
- `bench/endurance.ts` in renderer-browser runs versioned JSON live/export workloads and streams
  samples instead of retaining them. Live fixtures use the normal schema and self-contained
  saved-scene format; exports use an existing project and reject ranges beyond its duration.
  Reports distinguish synthetic input, browser JS heap and runner Node RSS. See docs/endurance.md.
  Long-duration checks are explicit local jobs, not part of the short CI suite.
  Export workloads may select decoded verification: full video decode/count plus bounded stereo
  source/output comparisons. Silence and periodic ambiguity are inconclusive, not alignment proof.
  Explicit audioAt checkpoints use output time; source time follows rounded render origins.
  --verify-video checks existing media without rendering. Reports retain input hashes, decoder
  versions, per-channel evidence and separate verification time. See bench/export-verification.ts.
  Live endurance graphics may request SwiftShader explicitly; record the actual active context
  identity before capture. operatorWindow separates controls from output and reads diagnostics
  from the control window. Both windows' errors are observed. Stacked software visuals failed
  with the former eight-packet transport queue; a short repeated-recovery workload passed after
  the half-second queue change. Keep exact workload and duration when reporting support.
- Live diagnostics start a fresh one-second frame-rate window when the capture source,
  availability or document visibility changes. Adaptive quality consumes each completed sample
  once. Availability changes reset hysteresis without reapplying an old metric; paused startup
  time is not evidence of rendering overload. See live/frame-rate.ts and output.tsx.
- Offline export Chromium uses `--disable-frame-rate-limit` to remove display refresh pacing,
  while retaining all frame readiness checks. This does not configure the user's live or preview
  browser. Keep the SwiftShader GPU check on the same scheduling mode. The measured one-worker
  improvement is 22–33% with identical decoded frames; two-worker improvement was small. See
  docs/renderer-scheduling.md for workloads, raw measurements and qualification limits.

- Offline selection is `renderer: remotion | browser`, defaulting to Remotion, with `--renderer`
  overrides on render/still/clip/preview. The CLI imports only the chosen adapter at runtime and scopes
  jobs to its session. Studio stays Remotion-specific. No silent exporter fallback occurs.
- Independent preview is `setcast preview --renderer browser` (or `renderer: browser`). It uses
  the browser export driver in a composition-sized iframe, serializes seeks and exposes completed
  RenderFrame/audio/readiness diagnostics. Silent playback waits for each frame. Resolved-input
  watching publishes valid revisions; failed edits retain the previous project. Reference images
  stay local to the browser. Retry replaces a failed driver. Library preview is read-only unless exports are enabled.
  CLI preview enables a bounded serial export queue under out/preview, using token/origin checked
  range requests and the existing resumable exporter. Project updates cancel stale jobs; shutdown
  awaits cancellation cleanup. Generated destinations prevent overwriting normal project outputs.
  Preview uses the user's browser; offline export still uses pinned Chromium. See
  docs/independent-preview.md and renderer-browser/bench/preview.ts. Run both exporter acceptance
  suites for shared driver changes and package-smoke for preview entry/export changes.
- Browser export uses pinned Playwright Chromium and system FFmpeg subprocesses. Frame requests
  are absolute and acknowledged after React/asset readiness. Mediabunny decodes background video
  frames explicitly; real-time native-video synchronization is not used for export. Bounded PCM
  windows supply the shared analyzer. One continuous master AAC stream spans video chunks.
- Browser export streams ordered JPEG frames with backpressure, defaults to one capture worker,
  and supports up to eight. Software H.264 only; parallelEncoding must be true. Existing output
  survives failure/cancellation. AbortSignal and CLI stop signals clean up active jobs in both
  adapters. `vp run package-smoke --browser` checks packed browser export too.
- Player Save scene writes a self-contained saved-scene-* directory, preserving source YAML.
  Local POSTs require an exact Origin and custom header. Copied assets stay inside the project;
  scene tree copies reject symlinks and recursive destinations. Export servers reject writes.
- The operator popup receives a React portal. The output window owns capture, diagnostics and
  journal state, so moving or closing controls does not start another input. Manual BPM and
  tap/downbeat controls provide a tempo grid. Opt-in beat tracking estimates tempo and phase
  from bounded PCM energy but changes output only when the operator adopts a locked estimate.
  The accepted grid uses the existing prepared-scene journal path. Never treat beat phase as
  a detected downbeat or the evidence score as a calibrated probability. See
  docs/live-beat-tracking.md for conservative real-recording qualification results.
- Session journals are versioned JSONL with capture-sample timestamps, serialized/fsynced writes,
  manual credits/cues and saved scene references. Replay requires a separate master and explicit
  offset. Scene times are finite seconds; core resolveFrame selects appearance at that time while
  keeping the finite timeline. The first scene supplies initial appearance and output dimensions.
  --theme replaces the scene sequence with one theme. Nondefault gain/delay replay is rejected.
- Stage font readiness is invalidated by CSS changes, including scene changes within an export.
  Shared acceptance now verifies cancellation as well as failure recovery. Cross-exporter pixel
  identity is not assumed across Chromium versions; see docs/browser-renderer.md for measured
  differences. Both implementation plans live in docs and include remaining qualification work.

- `setcast live [dir]` loads optional `live.yaml`, never `setcast.yaml`, and serves the shared
  browser player. Live controls select exposed input channels, sensitivity and visual delay;
  title, elapsed clock, theme and art are session overrides. H hides all controls without edge
  reveal; F enters fullscreen. OBS uses window capture and receives mixer audio separately.
  The operator popup shares capture with the output window. There is no native capture backend. See `docs/live-input.md`.
- Live output setup owns session-only display selection, input-loss fallback and adaptive GPU
  resolution. Fullscreen exit and unexpected operator closure keep clean output; H reveals controls.
  Muted input supplies silence and clears history. After 1.5 seconds without packets, a 100 ms
  confirmation timer lets queued PCM drain before failing capture. Fresh current-revision packets
  cancel it; stop/restart clears it. This avoids a false watchdog failure when animation callbacks
  run before queued MessagePort data after a long main-thread task. Dropped samples remain visible;
  ordinary silent PCM does not. RendererBindings.renderScale changes only live GPU visualizer buffers,
  never saved scene configuration or offline rendering. See docs/live-input.md.
- Live scene replacements mount hidden until readiness holds settle, retaining the previous
  ready scene. Capture never waits for those holds. Background video plays muted and loops;
  unlike recorded playback it does not seek against the audio clock. Theme, title and artwork
  changes never replace the capture owner. `capture-worklet.js` is shipped in the browser
  package's entry directory and served locally, including from packed installations.

- Browser live capture uses an AudioWorklet with discrete input channels and a silent output.
  Unacknowledged 1024-sample stereo packets have a half-second budget rounded up, capped at
  96 packets / 768 KiB (24 packets / 192 KiB at 48 kHz). This absorbs brief main-thread stalls
  without adding healthy-path latency. The packet being filled is separate. Dropped packets retain their absolute
  sample positions and become silence in the bounded 11-second PCM ring. Analysis uses core's
  PCM calculations with FFT lookahead, caches at most 2048 materialized moments, and never
  retains scratch PCM through lazy feature getters. Routing changes clear history without
  resetting session time. Channel selection refers to channels the browser actually exposes,
  which may differ from the interface's physical inputs.
- Live scenes use `ResolvedLiveProject` with `audio: null` and `mix: null`; recorded projects
  retain their finite `MixDocument` and mandatory audio file. `loadLiveProject` reads optional
  `live.yaml` and shares theme/CSS resolution without probing audio. `resolveLiveFrame` supplies
  empty credit/cue state and a null composition duration. Whole-set visualizers are omitted with
  a warning; clock totals and progress do not imply an endpoint. `data-mode="live"` identifies
  these scenes for CSS. A live session does not fabricate a recording or a finite timeline.

- `scripts/export-acceptance/` checks the core `Exporter` interface with generated media.
  Its runner selects Remotion by default and accepts a local adapter module and reference
  image directory. The checks require ffmpeg/ffprobe, compare decoded A/V pulse times,
  fractional ranges, delayed fonts, local images, video loops, repeated theme captures and
  failed-export recovery. See its README for commands, tolerances and coverage limits.

- Browser export pipelines captures into ordered FFmpeg writes, retaining one pending capture
  per worker plus the active write. Keep worker/frame assignments stable. A capture failure must
  interrupt other waits and close pages/encoder before awaiting outstanding work. Do not race every
  frame against one never-settled promise: its retained listeners grow with export duration.
- Every audible offline export encodes the master file once and muxes it with silent video,
  including a single batch and `chunkSeconds: 0`. The previous single-batch browser audio path
  delayed the acceptance fixture by about 43 ms; the file path aligns its pulses within 5 ms.
  Studio retains its audio component. Single-batch exports now also preserve existing output
  and remove temporary files on failure. Remotion uses its packaged FFmpeg; browser export uses system FFmpeg.

- Core/node owns local audio probing; core/media owns URL duration, channel and video probes.
  Their Mediabunny 1.50.8 metadata-first and compute-duration fallback behavior is unchanged.
  Keep the media subpath separate from the pure main entry, and file sources separate from
  browser code. CLI project loading must work when importing Remotion is forbidden; hardware
  preflight imports the selected renderer only when an encoding command requests it.

- Export requests, results and progress belong to core (`export.ts`). Remotion re-exports
  its previous public type names for compatibility and keeps its option translation local.
  CLI runtime renderer imports are centralized in `renderer.ts`, which selects Remotion or the
  opt-in browser exporter without a plugin registry. Studio preview options remain adapter-specific.

- Core owns export range rounding and chunk partitioning (`render-range.ts`). Ranges are
  inclusive absolute frame indices after converting the requested half-open seconds range.
  The Remotion adapter delegates to these functions without changing rounding or defaults;
  future exporters must use the same planning rules.

- Browser playback work and its staged regression plan are in `docs/browser-playback.md`.
  `historyTimes` requires a positive finite duration and positive safe-integer count;
  callers needing no history use current-frame audio. Prepared-cache releases are idempotent.
  The smoke checks real codecs, frame count and duration with ffprobe and non-silent decoded
  audio with ffmpeg when installed. Its AAC-tail tolerance is not a synchronization guarantee.
- `resolveFrame` in core/react assembles timeline, audio and modulation at one absolute frame.
  Renderer FPS and dimensions can override project defaults; display-clock offsets stay cosmetic.
  Core owns `pcmAnalyzer`, `PcmWindow`, the FFT and `framesWithinMix`. Remotion translates its
  decoded windows into those PCM inputs; their calculations and window readiness are shared.
- `setcast play` loads a finite recorded project and serves it on loopback through
  `@setcast/renderer-browser`. Its browser graph has no Remotion, enforced by ban-check.
  The CLI loads projects through core/node media probes; only encoding commands load the
  renderer for hardware preflight.
  HTML audio is the master clock; animation callbacks sample it and may skip visual frames.
  Missing analysis, artwork or fonts pause audio while preserving the user's play intent.
  Mediabunny decodes ten-second windows with eight seconds of history and FFT padding;
  only two windows are retained, with one decoder running at a time. Cache reads refresh
  recency so prefetch after a backward seek cannot evict the current window. MP3 codec
  padding can make native and probed duration differ; an explicit end seek remembers replay
  intent independently of the native clock. Native video follows master time with a 120 ms
  correction threshold while running, and seeks precisely when paused. This is approximate
  background synchronization, not frame-exact offline rendering or a broadcast guarantee.
  The player is bundled in memory on startup, using source exports in development and
  published exports in tarballs. There is no manual dev build or configuration watcher.
- The player's adjustments never write to the project. `play()` takes a `ThemeCatalog`, and the
  server resolves `/project.json?theme=<name>` on first request through the CLI's `loadProject`
  (plus the whole-set read when the theme needs it) and caches the JSON. The project's own theme
  is listed first, so a `.css` theme stays selectable. Credits and art are client-side overrides
  of `ResolvedProject` (`overrides.ts`): `panel`/`tracklist` keep their timing and counts, and a
  chosen file replaces the project's and every play's background as a blob URL with `#<name>`
  appended, which the browser ignores when loading and `backgroundKind` reads as the extension.
  The theme choice lives in the URL's `?theme=`; dock auto-hide and volume in `localStorage`.
  Menus are native popovers placed with CSS anchor positioning above the dock (`--sc-dock`).
- Rendering performance measurements and optimization priorities are in `docs/render-performance.md`.
  The benchmark lives inside the renderer adapter and uses its installed Remotion version.
  Keep preparation separate from rendering, record whether encoding overlaps capture, and compare
  longer clips as well as short samples. Remotion 4.0.513 scans prior frame/asset records per frame,
  so short-clip rates do not establish one-hour throughput. The benchmarks do not change defaults.
- Native capture feasibility and theme comparisons are in `docs/capture-feasibility.md`.
  Remotion 4 already supports optional HTML-in-canvas capture through its web renderer, but
  Chromium 149 visibly corrupts several themes. The isolated Chromium 157 samples are much
  closer. Native API availability alone is insufficient; verify the capture path and pixels.
  The default DOM composer cannot preserve the theme contract. No exporter migration is implemented.
- The finite mix model replaces the old tracks/events contract without compatibility aliases.
  `ResolvedProject.mix` is finalized before rendering. The caller supplies the audio-duration
  probe to `loadProject`; the CLI uses core/node's shared Mediabunny probe.
- `setcast inspect --json` materializes all IDs in a normalized document; `--at` exports a query.
  Normalized JSON uses integer microseconds and is read with `readMixDocument`, not YAML parsing.
- Background selection follows the first focused play and changes immediately. There is no
  fabricated "previous track" during an overlap. DJ panels retain credits after dwell;
  `--presence` separates this layout policy from the deterministic per-run `--show` signal.
- A DJ slot's height is `calc-size(auto, size - round(down, size * var(--closed), 1px))` in block
  flow, and its `margin-top` closes the gap the same way, so the slot moves panels only by whole
  pixels (see Gotchas: composited elements). A closed slot keeps the leftover fraction of a pixel
  of its height and gap; at `--fit: 1` both are exact. Chrome ignores
  `calc-size()` heights on flex items, and `overflow-clip-margin` rejects `calc()`, so the bleed
  is a constant. The clip is on the slot rather than a `clip-path`, because a `clip-path`
  ancestor becomes the backdrop root and empties every panel's `backdrop-filter`. Chrome applies
  `overflow-clip-margin` only when both axes are `clip`, so on the slot's `overflow: visible clip`
  `--slot-bleed` has no effect and whatever hangs below a slot is cut off. Masthead keeps its
  title rule in the title's padding for that reason.
- Built-in themes design their DJ layout explicitly (`[data-presentation='dj']` rules) instead
  of inheriting a shared grid. Focus changes emphasis (brightness, accent), never size, because
  automatic focus moves on every entrance and a size change there would jump.
- A credit has at most one line of small, widely tracked capitals. Built-in themes hide the
  "Now playing" eyebrow (they show "Returning") and hide an empty `.sc-panel-head`. They set the
  label and details in mixed case, quieter than the artist, and track small capitals at 0.3em or
  less (quicksilver's chrome display lettering is not small type).
  The gaps above and below the title are about two thirds of its cap height. List rows are
  separated by padding, not a hairline each; only the current row keeps its progress rule.
  A designer's review found these problems in every theme: stacked eyebrows, wide tracking and
  too little room around the title. Bunker's label tape and vfd's annunciator keep their
  capitals because they imitate hardware that prints them.
- Archived research under `docs/research/` is excluded from formatting. Preserve its bytes.
- `vp run mix-stills` renders tease, shared-drop, overlap, portrait and overflow acceptance images.
- Composition frame counts exclude any final frame whose time rounds to mix end in microseconds.
  For example, frame 2 at 30 fps rounds to 66,667 µs and cannot query a mix of that duration.
  `framesWithinMix` keeps renderer queries inside the half-open timeline.
  The shipped Knowledge excerpt fixture preserves F11's inherited-annotation qualification.

Versions verified 2026-08-19 (do not re-litigate; bump deliberately):

- Node 26.7.0 pinned (`.node-version`). Remotion 4.0.513 supports Node 26 (browser download fix
  landed in 4.0.463). Vite+ 0.2.9 requires `>=24.11.0`. Everything runs on Node 26.
- Vite+ 0.2.9 (`vp`), pnpm 11.22.0 under it (`devEngines.packageManager`). One root
  `vite.config.ts` holds fmt/lint/test/run config; per-package `vite.config.ts` only holds `pack`.
  `vite-plus` is a devDependency of every package (the template convention) via the pnpm catalog.
- CI installs `vp` with `voidzero-dev/setup-vp`, pinned to an exact tag because its moving `v1` tag
  is frozen at v1.15.0. The action reads the Vite+ version from the pnpm catalog, so CI runs the
  same `vp` as the lockfile, and `node-manager: false` keeps the Node from `actions/setup-node`.
  CI used to pipe `https://vite.plus` to bash and add `~/.vite-plus/bin` to the path. When the
  installer moved `vp` to `~/.local/share/vite-plus/bin`, every run failed with
  `vp: command not found`.
- Remotion 4.0.513 pinned exactly (peer dependency of the adapter). Rendering: `@remotion/bundler`
  `bundle({ entryPoint, publicDir: projectDir })` → `selectComposition` → `renderMedia({ codec:
'h264', audioCodec: 'aac', frameRange })`. Audio in the composition: `<Audio>` from
  `@remotion/media` (Mediabunny-backed, the recommended tag; `remotion`'s `<Audio>` is deprecated
  in favor of `Html5Audio`). Duration: `calculateMetadata` computes `durationInFrames` from the
  normalized mix duration. Windowed audio: `useWindowedAudioData` from `@remotion/media-utils` supports all
  Mediabunny formats since 4.0.383 (WAV no longer required); MP3/M4A/WAV/FLAC all work.
- Render analysis uses full-scale PCM as its FFT reference, never the peak of the loaded window.
  Stereo magnitudes and RMS combine channel power without phase cancellation; silence stays zero.
  Readiness includes FFT lookahead as well as history. Audio smoothing uses a fixed sampling schedule,
  independent of output FPS. Waveforms, energy and FFTs are computed only when read; scenes
  without audio consumers skip analysis.
- The fixed 2048-point FFT caches its trigonometric coefficients. Input copying, magnitudes and
  three smoothing passes use indexed loops; smoothing alternates two call-owned arrays. Preserve
  operation order and owned result arrays when optimizing this path: both renderers and live
  history must retain exact values across out-of-order queries. Compare a revision with
  `node packages/renderer-browser/bench/spectrum.ts --reference REF --out NEW_JSON` in Node and
  pinned Chromium before claiming a speedup. Kernel timings are not exporter throughput.
- Remotion bundles with webpack (its own esbuild loader for TS/TSX); `rspack: true` exists and is
  the announced future default. Vite+ drives everything else. They coexist because the adapter's
  bundle entry is plain TSX resolved through package `exports` → `src/*.ts`. No `tsconfig paths`
  (Remotion's bundler ignores them); use package imports only.
- Preview: Remotion Studio spawned via `@remotion/cli` (`remotion studio <entry> --props ...
--public-dir <projectDir>`). The CLI watches resolved project inputs, reloads them on edits, and
  atomically replaces the props JSON that Studio watches. Invalid edits keep the last valid props.
  There is no public programmatic Studio API. `setcast preview` forwards SIGINT, SIGTERM and SIGHUP
  to Studio and waits for it to exit, so a signal to either process stops both and the props are
  removed; a stop that the user requested is a normal exit, not a failure.
- TypeScript 7.0.2 (tsgo). `erasableSyntaxOnly` is on so Node can strip types: no enums,
  namespaces, or parameter properties. Imports use explicit `.ts` extensions.
- Zod 4.4.3 for every schema. `yaml` 2.9.0 for YAML (maintained, spec-complete, no deps).
- CLI diagnostics and progress go to stderr; redirected import/analyze drafts are uncolored YAML
  on stdout.
- CLI UX: `@clack/prompts` 1.7 + `picocolors` 1.1; argument parsing with `node:util` `parseArgs`.
  Nothing heavier without justification.
- Output paths are OSC 8 links and renders report OSC 9;4 progress to the terminal tab, but only
  in the terminals listed in `packages/cli/src/terminal.ts` (the lists of the supports-hyperlinks
  and anstyle-progress crates). Other terminals print OSC 8 as text or read OSC 9 as a desktop
  notification, and there is no way to ask a terminal what it supports.
- CLI failures use exit code 2 for command usage and project configuration, and 1 for runtime
  failures. `SetcastError` defaults to 2; runtime translations set `exitCode: 1`. Set
  `SETCAST_DEBUG=1` to print complete error and cause stacks.
- Spectrum is SVG, not canvas: bars are `<rect>`s so themes style them in CSS (`fill`, `filter`),
  output is resolution independent, and it stays renderer neutral. 128 rects per frame is cheap.
- Theme fonts are vendored OFL `.woff2` files inlined as data URIs into the theme CSS string at
  project resolution; renders never touch the network and the scene gets one self-contained CSS
  string. All built-in themes share `packages/themes/fonts/` (one `OFL.txt` lists every family)
  and `packages/themes/textures/`. Each face ships as the Google Fonts latin subset plus latin-ext
  cut down to U+0100-024F, so accented names (Polish, Czech, German, …) keep the theme's face
  without paying for Vietnamese and phonetic glyphs. Variable fonts that would weigh 100 KB+ are
  instanced to the weights a theme uses (fontTools `instancer`). A font with a Reserved Font Name
  (Marcellus) ships unmodified, because the OFL forbids modifying it under that name.
- `RenderFrame.analyzer` is the adapter's `AudioAnalyzer`, exposed so components can look back
  (`useAudioHistory`) the way modulation's `smooth` already did. Anything that reads it stays
  deterministic because the adapter holds each frame until `HISTORY_SECONDS` of audio is loaded.
- `RenderFrame.modulation` is a top-level field (not part of the original six) because it is
  resolved per frame from audio + mix state and is the bridge to CSS.
- `bpm:` and `beatOffset:` are plain top-level keys, not a `tempo:` block, because `bpm: 174` is
  what a DJ types. `analyze --write` sets `bpm` and `beatOffset` together, only when the project
  has no `bpm`. The offset is the first beat, not the downbeat: the flux fold finds beats, not
  bars, so `--bar` may be a beat or three off until the user moves `beatOffset` by a beat.
- `setcast analyze` drafts `drop` and `breakdown` only. Both are direct readings of bass energy;
  a buildup is musical intent that the same signal cannot distinguish from the breakdown it sits
  in, so inventing one would be noise the user has to delete.
- `analyze --write` appends the annotations it drafted and skips any within 2 s of one already in
  `setcast.yaml`, so it is idempotent and never rewrites what the user wrote. Both it and
  `import --write` stringify with `flowCollectionPadding: false`, so editing one block does not
  reformat `[1, 1.06]` elsewhere in the file.
- Demo audio is synthesized by `scripts/make-demo-assets.ts` in pure Node (deterministic, no
  ffmpeg), written as WAV, and gitignored; the background is a committed SVG. Fixtures in tests are
  inline strings.
- Publishing keeps the source-based development loop. The CLI's published bin is the executable
  `dist/main.mjs`; its templates resolve from a shared module at the same depth in `src` and `dist`.
  The renderer ships a compiled `Root.mjs`; its source bundle entry resolves the `./composition`
  package export, which points to source in the workspace and compiled JS in tarballs.
  `vp run package-smoke` builds and extracts all five tarballs into an isolated temporary directory,
  reuses installed third-party dependencies, and exercises init, inspect, every theme with
  branding (a logo, messages and an announcement), video, browser-player bundling and ranged
  asset serving.
  It requires pnpm and publishes nothing. Run it before a release or changing package layouts.
- Package `exports` → `src/*.ts`, `publishConfig.exports` → `dist/*.js`. Workspace development runs
  TypeScript sources directly on Node 26.
- `Img`/`Video` wrapper props are exactly `{ src, className, style }` (`MediaProps`), plus `loop`
  and `muted` on `Video`. Anything else (alt, loading, …) is either meaningless for video frames or
  breaks Remotion Studio.
- `background:` renders as a looping video when the path ends in `.mp4/.mov/.webm/.mkv/.m4v`, and
  as an image otherwise. The adapter binds `Video` to Remotion's `OffthreadVideo` wrapped in
  `<Loop>` (its length read once through mediabunny, `src/media.ts`), not to `@remotion/media`'s
  `Video`: OffthreadVideo draws the frame into an `<img>`, so `object-fit`, `filter` and `transform`
  from `.sc-bg-img` apply exactly as they do to a still. `@remotion/media`'s `Video` loops on its
  own but sets `object-fit` inline, which overrides the theme.
- `render()` serializes calls and temporarily `process.chdir()`s into the adapter package so
  Remotion's browser and bundle caches are shared across projects instead of each project dir
  getting a `.remotion/`. Serialization prevents concurrent calls from restoring the process-wide
  working directory in the wrong order. Render input/output paths resolve before changing cwd.
- `render()` and CLI clips split ranges longer than `output.chunkSeconds` (default 60, whole
  seconds 0–60; 0 disables) into video-only batches in one shared session. Capture is sequential.
  Short exports use one video-only batch. Frame ranges stay absolute, and the composition duration is
  unchanged. The adapter sets `renderAudio: false` in both input and resolved composition props;
  Remotion reads the latter independently. Audio analysis and its readiness holds still run.
- Audible exports encode the master once as stereo 48 kHz AAC at 320 kbit/s while rendering
  video. Final assembly copies both streams. This implements the existing master-only soundtrack;
  future audible plugin media needs a compatible mixing policy. Source audio starts at the
  rounded first frame, and pads a fractional final frame with silence. MP4/MOV use a 90 kHz
  movie timescale to avoid millisecond rounding of the final audio edit. FFmpeg remains a
  subprocess, through pinned Remotion's `RenderInternals.callFf` so its bundled binary and
  library paths work without a system install.
- Chunk files and the assembled output live in a temporary directory beside the destination.
  Only the final rename replaces an existing export. A failed audio or video worker cancels the
  other; both settle before temporary files are removed. Asset history is limited to one capture
  batch, but encoded files grow with set length until assembly. This is not a resumable export cache. Studio uses Remotion's own pipeline and does not apply chunking.
- If Remotion reports serial encoding and at least two chunks remain, software H.264 exports
  overlap the next JPEG capture with the previous chunk's encoding. The public `renderFrames`
  API writes images; the existing bundled-FFmpeg wrapper encodes them. Only one capture and one
  encoder run at a time, with at most two JPEG sequences on disk. Failure cancels both and waits
  for them before cleanup. Cancel a rejected `renderFrames` call before removing its abort
  listener: upstream may still have pages rendering and otherwise retry a browser during cleanup.
  Remotion's existing parallel path is retained when available.
  Hardware and specialized encoding settings stay on `renderMedia`.
  `output.parallelEncoding: false` disables both kinds of overlap. JPEG quality, frame times and the continuous master
  soundtrack are unchanged. Keep Remotion 4.0.513: the tested 4.0.534 upgrade removed its memory
  check but crashed Node with an unhandled encoder `EPIPE` before cleanup. Do not override the
  private memory heuristic or install a process-wide rejection handler. See the performance report.
- Audio duration comes from `mediabunny` (`Input` + `UrlSource`, `getDurationFromMetadata()` with
  `computeDuration()` fallback) during project loading; Remotion's `getAudioDurationInSeconds`
  is deprecated in favor of it. mediabunny is MPL-2.0 and a plain dependency of the adapter.
- Renders pass `jpegQuality: 95` (Remotion defaults to 80) and `output.crf` (default 18). The
  intermediate frames the encoder reads are JPEGs, and the default look is a dark scene full of
  smooth gradients, blur and a vignette, which bands badly below ~90. Both are `output:` keys.
- `output.profile: fast` supplies JPEG quality 92 and x264 `veryfast`; `standard` preserves
  JPEG 95 and `medium`. Explicit quality settings override profile defaults. Profiles do not
  change resolution, FPS or CRF. Hardware encoding uses the profile's JPEG quality only and
  rejects an explicit `x264Preset`, because NVENC presets differ from x264's. Configuration,
  direct renderer calls and Studio share resolution through `OutputSchema`.
- Hardware encoding is opt-in with `output.hardwareAcceleration` (`disable`, `if-possible`,
  `required`) and requires `output.videoBitrate` (e.g. `12M`). Explicit CRF conflicts with bitrate
  or hardware encoding; the schema adds CRF 18 only when no bitrate is present. The adapter
  validates the same rules for direct API calls before browser work and passes `crf: null` for
  bitrate encoding. Studio receives the same encoding and JPEG quality settings as CLI renders.
  Remotion's own `if-possible` check only looks for the encoder in its bundled FFmpeg, which always
  contains `h264_nvenc`; without an NVIDIA device FFmpeg exits and Remotion crashes on an unhandled
  `EPIPE`. `resolveHardwareEncoding` therefore encodes one frame with the encoder before `render()` and
  `preview()` start the browser or Studio: `if-possible` falls back to `disable`, `required`
  throws. The CLI calls it before its progress UI, so the fallback warning prints on its own line.
  A driver failure after encoding starts is still not recovered.
- `output.gl` defaults to `auto`: ANGLE on macOS and Linux, Chromium's default elsewhere. `default`
  restores Chromium's own choice on any platform; explicit backend names pass through the adapter.
  The same setting applies to metadata, renders, stills, bundled thumbnails and Studio render
  settings. The backend stays out of `ResolvedProject`: it configures the renderer, not the scene.
  On Linux, Chromium's own choice in the headless shell is SwiftShader, a software renderer, even
  when a GPU is present: a 6 s demo slice rendered at 3.9 frames/s against 12 with ANGLE on an
  RTX 3070 Ti. The GPU output differs slightly only in some SVG filters (Bristol, Pirate). In a
  container without a GPU, ANGLE falls back to software and matched the default at 9 frames/s.
  `egl` and `angle-egl` get no WebGL context in the headless shell there. See
  `docs/render-performance.md`.
- Procedural theme textures and the scaffold/demo background ship as pre-rendered PNGs, generated
  by `vp run rasterize-assets` with librsvg's `rsvg-convert`. SVGs remain the editable sources;
  ordinary rendering and `init` need no rasterizer dependency. The 2304x1296 background leaves
  room for the demo's zoom at 1080p; larger outputs can regenerate it or use the SVG directly.
  Keep geometric assets such as escapement's dial as SVG so their fine lines stay sharp.
- Long-exposure's light trail (the oscilloscope with all its history traces) uses two chained drop
  shadows. Each shadow filters the preceding result, so adding a third wide blur is expensive on
  this large SVG. Tune the two radii for the halo; compare both a drop flash and sustained
  playback. The trail is drawn in perspective (`rotateY`), with a mask fading its far end toward
  the credits, so it never crosses the type.
- Long-exposure puts its vignette above the bloom (`z-index: 1`, everything drawn on the
  photograph at 2). Bloom glows come from the unfiltered art, so over a darkened, vignetted edge
  they would otherwise float as white blotches. For the same reason the glow takes the art's
  correction, and `--lamps` turns it down on bright art: lamps glow in a dark scene, hardly in
  daylight. Afterhours does the same.
- Relief never shows the art; its ridgeline reads it. The lines take the art's colors
  (`fill: art`) and its terrain (`relief: 0.8`), so sets with different art look different
  although no image is on screen, and a set without art becomes a plain ridgeline plot in warm
  grey. The plot fills the frame above a band for the credits, so no type sits on the lines; in
  DJ mode the credits stand side by side in the band. A drop lights the older lines for 1.6 s
  instead of flashing the frame.
- Darkroom shows the art only where the music exposes it: a full-frame spectrogram with
  `fill: art` between two black film rebates. An SVG `feFuncA` in `paper.svg` is its paper grade,
  a contrast curve on the cells' opacity, so quiet cells stay black and loud ones print the art;
  without it, music that is loud across the spectrum exposed the whole frame and the theme read as
  the art behind a filter. The grade is CSS, so a user can soften or replace it. It is tuned on
  real drum and bass (the Stakka & Skynet excerpt); the demo synth is loud in nearly every bin and
  prints far more of the frame. The art behind the cells, `.sc-bg-img`, develops from 4% to 26%
  opacity with `--set-progress`, so the set opens on black and ends over a faint print. Both share
  one `--exposure`, a correction toward luma 0.42, because the cells are the only place the art
  is seen at full strength. The tracklist runs along the upper rebate like edge printing and
  moves on a frame with each listing (`--row-offset` along x).
- Escapement shows `.sc-art`, the file itself, in its band rather than `.sc-bg-img`. The band
  crosses the whole frame, so the blurred copy behind contained art (square sleeves in landscape,
  landscape art in portrait) would show in it as hard edges. It fits the file whole into the
  frame, where the stage measured the subject, scales it about the subject (at most 1.3 times the
  least scale that covers the band) and moves the subject just below the band's center line. The
  art keeps its colors; a `color` blend layer, clear on the center line and cyan toward the
  edges, makes the band read as cyan glass. Tinting the band with `--bg-color-1` turned beige art
  into mud and neon art into a flat print.
- Pirate shows `.sc-art` as a picture pasted on the sheet: it fills the frame while that keeps 70%
  of the art (the `backgroundFit: auto` threshold, computed in CSS with `round()`), else it shows
  the picture whole on paper, because the copy filter turns the blurred fill of contained art
  into grey smudges. It therefore ignores an explicit `backgroundFit`. Its spectrum is a strip of
  fluoro paper torn by an SVG displacement filter, `filter: url(./torn.svg#torn)`; `loadCss`
  keeps the fragment when it inlines the file, and Chrome applies a filter from a data URI.
- Bristol prints the art in two inks the same way, through a gradient map in
  `filter: url(./print.svg#print)`. Its stage root is a bottom-justified flex column, so its
  stripes stack and an opening stripe lifts the contour.
- The tracklist's rows are listings, the editorial tracklist; unlisted teases stay out of it, and
  the panel credits them while they play. Position follows listings, state follows
  contributions: the window is anchored on the latest listing group at or before now, and a row
  is `current` while its play contributes, wherever the row sits. In DJ mode several rows can be
  current, and a play that enters before its listing is current below the anchor. `played` also
  requires that the play has been heard, so a listing earlier than its entrance stays `upcoming`
  until then. A returning play lights its own row without pulling the window back.
- `tracklist:` is independent of `presentation.mode`. It is off unless the project or the theme
  turns it on; a theme names default counts in `Theme.tracklist`, which apply when `setcast.yaml`
  has no `tracklist:` key. The project's counts win key by key, and `false` turns a theme's
  default off. The tracklist replaces up next: the stage does not render `.sc-next` with it,
  rather than leaving every theme to hide it, and `after: 0` then shows nothing ahead.
- Every built-in theme designs its tracklist, but only themes that set it outside the art show it
  by default (`Theme.tracklist`): anamorphic in its upper bar, escapement on the paper's top left
  corner, patina in its header line, passe-partout on the wall above the label, darkroom along
  its upper film rebate. Switching to any
  theme therefore never covers more of the user's art than the theme already did. The others,
  which put the list over the art, show it when the project sets `tracklist: true`.
- The tracklist glides by interpolating the window's anchor and both edges between the previous
  and the current listing group, so `--row-offset` and `--row-presence` change together and a
  still at any moment shows the same frame as playback. Listing groups closer together than the
  glide (0.8 s) jump a fraction of a row; real tracklists do not do that.
- Playlist panels leave after `panel.dwell: 14` and `panel.fade: 1.2` by default. DJ panels keep
  credits visible, with focus controlling emphasis. Every entrance/dwell uses run start.
- With a tracklist, a DJ panel whose play the list shows follows the dwell too, so the screen never
  carries the same credit twice for a whole run. The handover happens in `--presence`, not in each
  theme's CSS: hiding a panel with CSS would make it jump, and a play whose row leaves the window
  (or that has none) must keep a panel. Its weight follows the row's `--row-presence`, so the
  panel reopens smoothly when the window glides past its row. `data-listed` lets a theme treat
  listed credits differently in playlist mode too (passe-partout and patina keep unlisted labels up
  for the run). `panel: false` removes panels entirely; loading warns when nothing then credits a
  play.
- `setcast chapters` preserves compiled timestamps on stdout and prints platform constraints to
  stderr, including the first timestamp, minimum chapter count and final chapter duration.
- `setcast render --bundle` writes the thumbnail and the description next to the MP4 (same base
  name, `.jpg` and `.txt`) with the defaults of `setcast still` and `setcast chapters`. It is a
  flag, not the default, so a plain render still produces exactly one file, and it refuses
  `--range` because a slice has no upload to bundle for.
- `setcast clip` puts the drop a third of the way into the clip, not in the middle: a promo cut
  needs the payoff early, and a third leaves enough buildup to read as one. Length defaults to
  45 s; the adapter clips the end to the set, so a clip near the end just comes out shorter.
- `setcast still` grabs the first `drop` by default (a quarter into the set when there is none) and
  picks png/jpeg/webp from the `--out` extension, defaulting to `output.file` with `.jpg`. It
  renders the frame exactly as the video shows it, so a set whose panel has already left gets a
  thumbnail without one; `--at` is the answer, not a special case in the renderer.
- `setcast init --demo` and `vp run demo-assets` share one synth (`packages/cli/src/demo/synth.ts`);
  init writes a 40 s version (`synthesizeDemo(0.25)`), the repo task the full 2:34.
- The README logo uses separate light and dark PNGs under `docs/assets`, selected with a
  `prefers-color-scheme` `<picture>`. Keep both variants the same dimensions so switching themes
  does not change the README layout.
- Local real-mix demos live in gitignored `/demos/`, including original downloaded audio and
  rendered videos. The Stakka & Skynet demo keeps source-clock timings in `demo.yaml` and
  regenerates a clip-relative `setcast.yaml` with `regenerate.mjs`. Inherited blend observations define overlapping contributions; their qualification is retained
  in evidence, and unknown deck labels are omitted.
- `withRenderSession` shares a browser and bundle across clip batches, theme stills and upload
  side outputs, then closes the browser and removes temporary bundles even on failure.
- Local Remotion bundles use `symlinkPublicDir` so subsequent renders do not copy source audio
  and previous outputs into each temporary bundle. Remotion falls back to copying on Windows.
- Prepared background and bloom caches retain active resources plus four inactive entries,
  evicting least recently used entries and revoking generated blob URLs. Failed preparations can retry.
- Background art is prepared in the browser, not in Node: `useBackgroundArt` loads each image
  on demand, fits it to the frame and measures what the frame shows in a canvas of the frame's shape,
  64 cells along its long side, holding the frame until it is done, so any format Chrome decodes
  works without ffmpeg. Video is neither fitted nor measured. The canvases are CPU-backed (`willReadFrequently`), so every render tab
  composes and measures the same pixels.
- `backgroundFit: contain`, and `auto` once covering would cut more than 30% of the art, is
  composed in that canvas: the art whole over a blurred, darker copy, handed to `.sc-bg-img` as a
  blob URL. One image keeps every theme's filter, blend mode, clip and drift working unchanged; a
  second DOM layer would have needed each theme's treatment twice and broken its blend modes.
- Each theme starts the filter of the art it shows (`.sc-bg-img`, or `.sc-art`) with an exposure
  correction whose strength is `--bg-correction`, the theme's default in the fallback so users can
  override it. The default is applied only where it fixes something visible, judged against the
  test images. Pirate corrects fully toward `REFERENCE_LUMA`: its `brightness(5.4) contrast(2.1)`
  turns any bright image into blank paper otherwise. escapement corrects halfway (0.5) toward its
  own `--art-luma` (0.3), so a dark sleeve and a sunny image both read in its band. long-exposure
  corrects halfway (0.5): full correction darkens bright art until it disappears. quicksilver
  leaves the art untouched (0): it shows it in a glass orb on bright silver, where art of any
  brightness reads. sterile-tech corrects a fifth of the way (0.2), so a sunny image dims a little
  and keeps its color. afterhours only dims: it corrects halfway toward its own `--art-luma` (0.2)
  and never brightens darker art, so a dark sleeve stays as it is and a sunny image turns to
  evening light. bunker also only dims, at 0.6 toward its own `--art-luma` (0.2); its lamp pool
  and the bloom do the rest. interference corrects halfway (0.5) toward its own `--art-luma` (0.3)
  and keeps the art's colors; caption boxes keep its type legible. vfd also corrects halfway
  toward 0.3: the art is the room its display sits in. patina corrects fully toward its own
  `--art-luma` (0.3), the brightness at which its print shows art; at the demo's 0.09 it showed
  dark art, the usual drum and bass art, as nothing. bristol corrects fully toward its own
  `--art-luma` (0.42) before printing the art through its gradient map (`print.svg`), so dark and
  bright art both use every ink. Verify changes against real art, not the demo art, which is
  nearly black and flat; the gitignored `demos/backgrounds/` holds a local test set when present
  (never commit those images).
- The art's hues come from a 24-bin hue histogram weighted by chroma times saturation, so a dark
  but saturated scene still reads as its color, with a minimum share so a few stray pixels in grey
  art give none. sterile-tech's accents, masthead's and anamorphic's ink, passe-partout's wall,
  quicksilver's chrome (a sky from the first hue over a ground from the second) and the faint tint
  of vfd's glass reflection take them, at the theme's own lightness and chroma so contrast stays
  as designed. interference shows the art in its own colors and keeps its RGB-split ghosts magenta
  and cyan, and themes whose palette is their identity do not take art colors.
- `--bg-luma-behind` is measured per element, not for fixed zones of the frame: zones would bind
  every theme to the built-in layout, while an element's box follows whatever layout its theme
  gives it. A theme cannot add elements and pseudo-elements inherit from their host, so the fixed
  `MEASURED_ELEMENTS` list in `Stage.tsx` (header, title, clock, panels, up next, tracklist,
  branding)
  covers custom themes too. A layout effect removes the
  previous values, reads every box, then sets the new values. Removing first makes every render
  tab measure the same layout whatever frame it rendered before; reading all boxes before writing
  lays the frame out once. On a 1080p slice it cost 0.57 ms a frame for four elements, against
  about 100 ms a frame per render tab, and render times did not change measurably.
- Detail is the mean absolute luma difference between a cell of the measured grid and its four
  neighbors, so it measures structure at about 1/64 of the frame: a texture finer than a cell
  averages out, and a dense image of moderate luma still reads as busy. The focus is the center
  of the cells busier than the mean, weighted by how much busier, which lands on the subject of
  every test image. The calm candidates are fixed areas of about a third of the frame rather than
  a free search, so a theme can lay out each one in CSS; ties go to the bottom left, where
  credits usually sit. All of it is measured once per image, before the theme's filter.
- Loading warns about art the frame enlarges more than 1.5×, naming the side that limits it, and
  notes when `auto` shows art whole. `readImageSize` reads PNG, JPEG and WebP headers itself
  rather than adding an image dependency; other formats are skipped.
- `setcast still --theme all` loads the project once per built-in theme and names each file
  after it (`thumb-pirate.jpg`). The CLI prints each configuration warning once per process.
- Configuration warnings distinguish explicitly written `panel.fade` from its schema default;
  `panel: { dwell: 0 }` is valid without a warning about an unused default fade.
- The adapter checks localhost binding before starting Remotion. In restricted sandboxes,
  Remotion can leave its compositor running after failing to acquire a port; the preflight
  reports the permission problem before starting that process.
- `clockOffset:` adds a nonnegative timecode or seconds to the header clock and its endpoint
  (default 0). It is display-only: `RenderFrame.timeSeconds`, event times, audio analysis,
  progress, tempo, render ranges, and YouTube chapters stay on the audio file's timeline.
- `clockTotal:` optionally replaces the displayed clock endpoint with a positive duration in
  seconds or timecode form. It does not change the composition duration or progress.
- `visualizer:` takes one block or a list of blocks drawn in order, and `[]` draws none. The key
  stays singular so existing projects keep working; `ResolvedProject.visualizers` is always a list.
  `resolveVisualizerConfigs` checks each entry against its own visualizer's schema, so an error
  names `visualizer[1].bars`, not the list.
- Built-in themes are one folder each (`theme.css` plus any SVG it draws with) and one
  `src/<name>.ts` with the modulation patch and default visualizers. `escapement`,
  `long-exposure`, `bristol`, `patina` and `quicksilver` nod to classic drum & bass sleeves
  through composition, palette and type only: no artist, title, label or logo, and OFL
  lookalike fonts rather than the sleeve fonts. Textures are SVG turbulence with
  `color-interpolation-filters="sRGB"`; the linearRGB default renders them far lighter than
  the matrix values suggest. Randomness in a theme (shake, tears, film flicker) comes from
  `sin()` of `--set-progress` or `--since-*`, never from anything that differs between renders.
- A theme may name the visualizers it is designed around (`Theme.visualizer`, written like the
  `visualizer:` key). `loadProject` uses them only when `setcast.yaml` has no `visualizer:` key, so
  a project's choice always wins and `visualizer: []` still draws nothing. `setcast init` leaves
  the key out for that reason. An invalid theme default is reported under the theme's name,
  because the user cannot fix it in `setcast.yaml`.
- `style: bars | line` is shared by spectrum and radial so the same word means the same drawing.
  Spectrum `segments` cuts the bars with an SVG mask rather than drawing one rect per cell, which
  keeps a frame at 2 rects per bar. The mask's fills are inline styles, because theme rules such
  as `.sc-spectrum rect { fill }` otherwise repaint the mask and erase the gaps.
- Bloom finds the art's lights once per image, in a canvas 480 px along the frame's long side:
  pixels among the brightest `lights` share that are also 0.12 brighter than the mean of their
  surroundings (6% of the long side) and at least 0.3 luma (`lightLayers` in `lights.ts`, pure and
  tested). The surroundings rule keeps a bright sky or paper from glowing while lamps in a dark
  room do. Each layer is blurred into a halo and a tighter core and kept as a blob URL, so a frame
  only changes opacity. Splitting by hue relates sound to color without an arbitrary mapping of
  frequency to position: in a bar with warm lamps and cyan screens, bass swells the lamps and the
  highs flicker the screens.
- Meters are HTML with `--level` rather than SVG like the spectrum: a meter is a few boxes and a
  text label, which CSS lays out and styles more directly than SVG geometry and `<text>`.
- The vectorscope plots `(right - left, left + right) / √2`, the usual goniometer orientation:
  mono on the vertical axis, hard left leaning up-left. A point outside the circle is pulled onto
  it rather than clipped by the box. Both scopes draw straight segments through all 512 points;
  at that density a spline adds cost and no visible smoothness.
- `fill: art` places its copy of the art and its clip path from the frame's layout in a layout
  effect, every frame: the copy goes over the measured box of the art the theme shows
  (transforms included) with its `object-fit` and `object-position`, and the clip follows the
  SVG's measured box. The art is `.sc-art` when its computed `display` is not `none`, else
  `.sc-bg-img`; reveal renders a copy of each and shows the one that matches, and bloom reads its
  lights from the file itself, so its glow fits either (over a contained background it covers only
  the file). Themes position visualizers
  and move the background freely (bunker insets and shakes `.sc-bg`, interference translates the
  image, pirate drops the drift), and CSS alone cannot align a layer with another element's box.
  interference shows `.sc-art` as a moving ghost, so art copies and bloom follow its offset;
  quicksilver clips `.sc-art` itself to its orb, so they follow that clip.
  A clip on `.sc-bg` (escapement, or patina's `overflow: clip` around a `.sc-art`
  larger than its print) does not apply to the copy, so the shapes show the art also where the
  theme hides it. Rotating `.sc-bg-img` or the SVG would misplace the copy, so pirate pads and
  rotates its spectrum only without `fill: art` (`[data-fill='theme']`).
- The spectrogram is a 2D canvas: 120 columns of 64 bins
  is 7,680 cells a frame, too many DOM nodes. It repaints entirely in a layout effect every frame
  from `useAudioHistory`, so it keeps no state across frames, and takes its color from CSS
  `color` so appearance stays in the theme. Columns are placed by age, not index, so it scrolls
  smoothly between the 1/30 s grid moments. It writes one pixel per moment and bin and stretches
  that image over a canvas of its box's size with smoothing, so a full-frame spectrogram has no
  17 px rows (the strain range of the regular-pattern gotcha). `fill: art` then draws the art
  into the canvas with `source-in`, from images decoded once per file, rather than masking a DOM
  copy of the art: a mask image made from the canvas would decode asynchronously and could miss
  the frame.
- A ridgeline line keeps its moment and rises with its age, like a spectrogram column scrolls.
  Lines fixed in place that cross-fade between moments made peaks flicker from line to line; a
  rising line carries a peak up the stack in one piece, and the art's relief, read at the line's
  current height, changes smoothly under it. The relief is the art's luma stretched between its
  2nd and 98th percentiles, so a dark sleeve raises as much relief as a bright photo and every
  set gets its own terrain. `fill: art` colors a line with one horizontal gradient of the art
  along its row rather than an SVG pattern of the image: an `<image>` inside a pattern loads on
  its own, with no way to hold the frame until it has. The colors are brightened to at least
  luma 0.3, so lines stay visible over the dark parts of the art.
- `peak` and `trail` read the audio history (`audioHistory`, the non-hook form of
  `useAudioHistory`) instead of remembering earlier frames, so every frame still renders on its
  own. A peak holds for `peak` seconds, then falls at `PEAK_FALL_SECONDS` (0.6) per full scale.
  Trails sit one wave length (1/30 s) apart, so consecutive traces are consecutive audio.
- The set envelope is read in Node before rendering, not in the browser: the browser only ever
  has 30 s of audio loaded, and a Node decode already exists. It decodes at 4 kHz with 0.05 s
  hops, which is enough for points that each cover seconds and keeps a two-hour set to about
  230 MB of samples; a two-hour MP3 reads in about 6.5 s. Only projects whose visualizers ask for
  it pay that, and `chapters`, `analyze` and `import` never do.
- `--travel-bass` and `--travel-high` integrate the set's band energy (each hop capped at full,
  then averaged over 0.5 s), from the same pass as the envelope, as a point every 0.25 s: about
  420 KB of props for two hours. A `--mod-*` level can drive a speed, but CSS cannot integrate it,
  and a rotation by a level swings back with every kick, so motion that follows the music needs
  the sum. The stage sets them only when the CSS contains `var(--travel-`, so other projects skip
  the decode. No built-in theme uses them yet.

## Not yet decided

- Sidecar format for precomputed AudioFeatures (JSON first; binary layout later). `wave` is
  1024 floats per frame, far more than the rest; a renderer that has the PCM anyway should slice
  it at render time instead of storing it.
- Native multichannel capture and OBS browser-source integration beyond the current browser-window
  capture workflow. Live audio already drives the shared Stage; hardware event timing remains undecided.
- Plugin loading for npm plugins (generated bundle entry vs. config-time import map).

## Code values (binding)

- **Use the modern platform.** Greenfield, latest everything. Before adding an npm package, check
  whether modern JS/Node already provides it. Prefer the newest TypeScript, React, and especially
  CSS features; output renders in a current Chrome, so the latest CSS and web platform are fair
  game and encouraged.
- **Overengineering is the worst thing an engineer can do**, and the JS/React ecosystem has the
  strongest tendency toward it. Resist patterns that exist in training data only because the
  community over-abstracts. Simple is better than complex. Simplicity wins.
- **Straightforwardness.** Code must be understandable without the reader's full attention. If a
  function requires holding three other files in your head, the design is wrong.
- **Principle of least surprise.** Names, structures, and behaviors are exactly what a reader
  expects. If a reviewer would raise an eyebrow, rework it until the eyebrow stays down.
- **Beauty.** Good code looks inevitable. After writing a piece, step back: does it feel settled,
  balanced, obvious? If a line makes you squint, reshape it. Software should be beautiful too: the
  CLI must be delightful; tasteful color, clear progress, well-set output. Don't overdo it.
- **Names carry meaning.** Prefer concise names, never merely short ones. One-letter names are only
  for conventional indices or a mathematical formula whose complete scope is a few lines. Name
  collection items after the domain value (`event`, `route`, `track`), not `e`, `r` or `x`. Outside
  those tiny scopes, use the exact domain name even when it is longer: `durationSeconds`,
  `projectDir`, `renderedFrames`. Do not use generic names such as `data`, `value`, `item`, `ctx` or
  `result` when the value has a stable, more specific name.
- **Comments are not a virtue.** If code needs an explaining comment, the code is probably wrong.
  Comments that remain document gotchas.
- **Simple, composable elements.** Ask whether a new thing is a platform abstraction (event
  timeline, RenderFrame, plugin interfaces). If yes, spend extra design effort there, still without
  overengineering. Everything else stays plain.
- **DX and configurability are core product values.** Target: 90% of customization without JS.
  Themes are CSS, behavior is YAML, the modulation matrix exposes CSS custom properties. Whenever
  you design a feature, ask: can a DJ who knows only CSS and YAML use this? If not, add the
  declarative path. Plugins are the escape hatch for the last 10%.
- **Tests are a liability.** Write them where they earn their keep (schemas, parsers, timeline
  math, modulation curves, motion math); never add cases thoughtlessly; never test JSX appearance.
- **Errors state what's wrong and what to do.** They are read by agents as often as humans. The
  full rule is the Errors section below.
- No em dashes in prose; use `–`. No AI attribution in commits.

### Function bodies (binding)

- A function operates at one level of abstraction. A CLI command coordinates named steps; it does
  not implement argument parsing, domain calculations, persistence and presentation inline.
- An orchestration function reads as a short sequence of domain operations. Its control flow must
  be understandable without opening the functions it calls.
- Keep each statement simple. Prefer guard clauses, ordinary `if` statements and named intermediate
  values. Avoid nested ternaries, conditional object spreads, nested callbacks and expressions that
  combine branching, formatting and I/O.
- Separate pure calculation from filesystem, process, terminal and network I/O. Parse and validate
  at the boundary, then pass valid domain values through the rest of the program.
- Keep callbacks to one expression or a few obvious lines. Extract a longer callback when the
  extracted function names a real operation.
- Extract code by responsibility, not by line count. Do not create `handleThing`, `processData`,
  `step1` or trivial forwarding helpers to satisfy a metric. Keep a helper in the same file until
  reuse or a real package boundary justifies moving it.
- Use an options object when a function would otherwise take more than four arguments.
- Production functions normally stay below 50 lines and cyclomatic complexity 15. A linear
  numerical algorithm may exceed these limits when splitting it would obscure the algorithm. Keep
  that exception local and document why the linear form is clearer.
- Modern syntax is welcome only when it reduces cognitive load. An explicit statement is better
  than a compact expression that a reader must decode.
- Before finishing a change, read every changed function body from top to bottom. Simplify any line
  that performs several conceptual operations or requires the reader to mentally expand it.

### Errors (binding)

Every error is read by someone who has to act on it: a DJ at the terminal, or a developer or agent
reading a stack trace. A generic message (`Invalid input`, `ENOENT`, `Cannot read properties of
undefined`) costs that reader a debugging session the code could have saved. Predict invalid states
and report them; do not let them fall through to whatever the platform or a dependency says.

- **Predict invalid states at the boundary.** When a feature takes input (a `setcast.yaml` key, a
  CLI flag, a file, a plugin config), enumerate the ways it can be wrong and decide what each one
  reports before writing the happy path. Validate everything the program can know up front before
  it does expensive work: a bad `--range`, a corrupt audio file or a missing font must fail before
  the browser downloads and the composition bundles, not after.
- **Every user-facing error has three parts**: what is wrong, the offending value with where it is
  (`setcast.yaml` path such as `plays[2].at`, file, line, flag), and what to do about it. When
  the valid choices are a short list, list them (`Available importers: cue, plain`). Throw
  `SetcastError(message, hint)` for these, or `ConfigError` for a list of `setcast.yaml` issues.
  The CLI prints message and hint; nothing else needs to know about terminals.
- **Schema messages are written, not defaulted.** Every constraint in a Zod schema that a user can
  break carries its own `error:` text in the three-part form. A default Zod message reaching the
  terminal is a bug.
- **Programming errors name the contract that was broken.** A hook used outside its provider, a
  registry lookup for an unregistered name, a plugin that returns the wrong shape: throw a plain
  `Error` (or `RangeError` / `TypeError`) whose message names the function, the received value and
  the rule it violated, and says how to satisfy it (`useFrame() called outside a <FrameProvider>`).
  These are for developers and agents, so keep the stack; do not convert them to `SetcastError`.
- **Translate third-party failures where the cause is known, pass through where it is not.** When
  a dependency (Remotion, mediabunny, ffmpeg, `parseArgs`, `node:fs`) fails for a reason Setcast can
  name, throw a `SetcastError` that says it in Setcast's terms and keep the original as `cause`.
  Never swallow an error to replace it with a guess: catch narrowly (match `code === 'ENOENT'`, an
  error class, a known message), and rethrow anything else untouched. A `catch` block that discards
  the error it caught is a bug even when the replacement message reads well.
- **Warn about predicted states that are not fatal.** A route on `beat` in a project without
  `bpm:`, `--all` with a set that has no drops: when the run can
  still produce something, say what will happen and why, on stderr, and continue. Silence is only
  right when the state is unremarkable.
- **Consistent policy for out-of-range times.** A flag or value that points outside the set is an
  error, not a silent clamp, unless the documentation says the value is clipped (as `--range`'s end
  is). One rule per concept, and the help text states it.
- **Errors are part of the feature and get tested where cheap.** A parser, schema or validator
  test asserts the message and the hint of its error paths, not only that something throws. Render
  paths are not tested for their errors; their failures are translated at the adapter boundary.

### Canonical orchestration shape

This is the target style for a command, job or other workflow function. Names will change with the
domain; the shape should remain recognizable.

```ts
export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('analyze');
  const project = await load(options.dir);
  const analysis = await analyzeProject(project, options.sensitivity);

  showAnalysis(analysis);

  if (options.write) {
    await updateProject(project, analysis);
    return;
  }

  printDraft(analysis);
}
```

This function is good because it reads almost as prose. Each statement performs one operation. The
names state intent. Blank lines separate input, execution, presentation and output. The exceptional
write path returns early, leaving the default path flat. Library details and data manipulation live
behind functions named for real domain operations. A reader understands the workflow without
opening another file, while each called function can be understood and tested on its own.
