# Setcast – agent guide

Setcast is an event-driven visual engine for DJ sets. It turns a recorded set (audio file +
tracklist + background art) into a broadcast-quality MP4 for YouTube: a themeable, CSS-styled UI
with a frosted-glass "now playing" panel, deck indicators, and audio-reactive spectral
visualization. Default aesthetic: dark, sterile sci-fi / rusty tech (neurofunk, techstep, jungle).
Credited intervals and musical annotations share a finite mix timeline. A future live mode can use the same
components rendering as an OBS browser-source overlay during Twitch streams, driven by real-time
events from DJ hardware, recording an event log that regenerates the polished VOD afterward
("stream once, publish twice"). Live mode is not built yet; the architecture anticipates it.

This project is engineered agentically. This file is the map. Read it fully before changing
anything; update it when you make a non-obvious choice (Decisions) or discover a gotcha.

## Quick orientation

```
packages/core               @setcast/core – event timeline, schemas, RenderFrame contract,
                            hooks, interpolate/spring, media wrappers, modulation, analysis,
                            registry, importers, project loading (node entry), built-in components
packages/renderer-remotion  @setcast/renderer-remotion – the ONLY package that imports Remotion
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
- `@setcast/core/node` – Node only: `loadProject(dir)`, theme/CSS resolution, audio decoding,
  error formatting.

Packages point `exports` at `src/*.ts`; Node 26 runs TypeScript sources directly (type stripping),
so there is no build step in development. `vp pack` builds `dist/` for publishing
(`publishConfig.exports`). Do not reintroduce a dev build step.

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
vp run theme-stills [dir] [--at 1:51]   # one still per built-in theme + a contact sheet
vp run ready               # check + test + ban-check + smoke (what CI runs)
cd examples/demo && vp run render [--range 1:00-1:10]      # full render / slice
cd examples/demo && vp run preview                          # Remotion Studio
```

`vp <name>` runs a built-in; `vp run <name>` runs a package script or `vite.config.ts` task.
Inner loop for an agent: `vp check && vp test`.
For theme work, `vp run theme-stills --at 1:50.4 --theme <name>` renders a moment of examples/demo
into `examples/demo/out/themes/` in about 4 s per still; read the images before committing.

Before you finish a larger piece of work (a feature, a refactor, a theme, any change across several
files) or commit it, run `vp run ready` and read the result. It runs check, tests, ban-check and the
smoke render in about a minute; run `vp run demo-assets` first on a fresh checkout. If it fails, fix
the failure or report it with its output. Do not call the work done while it fails. `vp run ready`
is what CI runs (`.github/workflows/ci.yml`), minus asset generation, but do not rely on CI to catch
a failure: nobody noticed CI failing on every push for a month.

Gotchas:

- `vp` must be the **standalone binary**, not the `vite-plus` npm package installed globally. Get
  it from `curl -fsSL https://vite.plus | bash`, or from mise with
  `mise use -g github:voidzero-dev/vite-plus` (the same release artifact; mise's own registry entry
  for `vp` points at `npm:vite-plus`, which is the wrong one). The standalone binary delegates to
  the project's local `vite-plus`; a globally installed npm copy runs its own Vitest instead. Test
  files import `describe`/`test` from `vite-plus/test`, which always resolves through the project's
  `node_modules`, so the two copies split Vitest's runner state and all 19 test files fail at the
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
- To debug the scene in Studio headlessly: start `vp run preview --port 3111` in examples/demo, then
  drive `openBrowser('chrome')` from `@remotion/renderer` at `http://localhost:3111/setcast` and log
  `onBrowserLog`. (A script doing exactly that lived in the scratchpad of the bootstrap session.)
- A theme's `@container (aspect-ratio < 1)` block cannot restyle the stage root, because an
  element never matches its own container query. The root's `::before`/`::after` and every
  descendant do match, so portrait overrides go there. A custom property derived from another
  (`--rise: calc(100cqw * tan(var(--angle)))`) is computed where it is declared, so a theme that
  changes `--angle` for portrait declares both on those elements (see escapement).
- A regular high-contrast pattern over the whole frame (a halftone dot screen, fine stripes) is
  hard to watch: the eye cannot settle on it, and at about 10–20 px per period on a 1080p frame
  it sits where visual strain peaks. Give textures an irregular structure, low contrast or low
  coverage (pirate's toner dust, not a dot grid).
- A full-frame `backdrop-filter` roughly triples render time (a 6 s slice: 43 s against 14 s
  without it). Keep backdrop blur on small elements such as the panel.
- `vp run render --range 0:30-0:45` passes flags through; do not insert `--` (it becomes a
  positional `dir` argument).
- Audio feature gains (`spectrumFeatures`, `logBins`) are calibrated against the demo synth. Real
  masters are louder in the highs; the `gain` knobs on visualizers and `range` on routes are the
  user-facing correction. Re-calibrate with a script like the bootstrap session's `calib.ts`
  (read the WAV, call Remotion's `getVisualization`, print band energies).

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

`packages/core/src/audio.ts`. `AudioFeatures = { bass, mids, highs, rms, onset, bins[64], wave }`,
all 0..1 but `wave`; `bins` are log-spaced and tilt-flattened (raw FFT is bass-heavy). `wave` is
`{ left, right }`, `WAVE_POINTS` (512) signed samples per channel covering the `WAVE_SECONDS`
(1/30 s) that end at the frame, each the mean of the audio it covers (`waveSlice`), for scopes.
The adapter loads the left and right channel with two `useWindowedAudioData` calls (it returns one
channel per call; mono loads its channel twice) and holds the first frame until mediabunny has
read the channel count. `AudioAnalyzer =
{ featuresAt(time) }` is what the adapter provides; `featuresFromSpectrum()` turns a linear
magnitude spectrum into features and is pure (tested). v1 implementation lives inside the Remotion
adapter (`useWindowedAudioData` + `visualizeAudio`). Successor (roadmap): FFmpeg subprocess →
streamed PCM → fft.js → precomputed sidecar per frame (JSON first, binary later). Live mode later:
Web Audio `AnalyserNode` feeding the same interface. FFmpeg policy: **subprocess only, never
linked**; keeps MIT Setcast cleanly separate from (L)GPL FFmpeg builds.

### Offline analysis

`packages/core/src/analysis.ts` (isomorphic, pure) reads decoded mono audio into an `Envelope`:
one bass and one high value per ~11.6 ms hop, scaled so the loudest stretch of the set is 1. Two
cascaded one-pole filters at 150 Hz do the band split, so there is no FFT and no dependency.
`detectSections()` reads the bass envelope as loud and quiet stretches with hysteresis and returns
a `drop` where the bass comes in and a `breakdown` where it drops out; `estimateBpm()`
autocorrelates the onset flux over several windows and takes the median, preferring the fastest
lag that still correlates so a 174 BPM roller does not read as 87. `nearestBeat()` folds the onset
flux around a moment by the beat period and reads the grid off where the hits pile up; it is local
(±8 s) so a tempo a tenth of a BPM off cannot drift the grid over an hour. `snapToBeats()` is an explicit helper for callers that choose to move drafts onto it and `beatOffset()` places the first beat. `setcast analyze` prints detected times without snapping as
a draft `annotations:` block plus `bpm:` and `beatOffset:`, or merges them into `setcast.yaml` with
`--write`.

`decodeMono()` in `@setcast/core/node` produces the PCM: ffmpeg subprocess when it is on PATH
(every format, streamed), and a built-in PCM WAV reader (16/24/32-bit, float) otherwise, so a freshly scaffolded
project analyzes without any install. This is the first half of the AudioFeatures sidecar on the
roadmap.

### Media wrappers and readiness

`packages/core/src/react/renderer.tsx`. `RendererBindings = { name, Img, Video, hold }`.
`Img`/`Video` are the adapter's components; `Video` also takes `loop` and `muted`; `useAsset(src)` preloads and holds the frame until
loaded; `useFontsReady()` holds until `document.fonts.ready`. The default bindings (no adapter)
are plain `<img>`/`<video>` with a no-op `hold`, used in tests.

### Plugin registry

`packages/core/src/registry.ts`: `Registry<T>` (`add`, `get` with a helpful error listing known
names, `names`). Instances: `importers` (`@setcast/core`), `visualizers` (`@setcast/core/react`).
Each plugin kind is a small interface plus a Zod schema for its config. Extension points (roadmap
list; implemented today: visualizer, theme, tracklist importer):

- visualizers `(RenderFrame, config) → JSX` (spectrum ✓, radial ✓, meters ✓, oscilloscope ✓,
  vectorscope ✓, spectrogram ✓, overview ✓); `visualizer:` takes one block
  or a list drawn in order
- themes: CSS variables + fonts + default modulation patch + default visualizers + layout
  (11 built in, listed in the README ✓; a bare `.css` path is also a valid theme)
- tracklist importers: plain "MM:SS Artist - Title" ✓ (`ID - ID` dubs ✓), `.cue` ✓,
  Rekordbox/Serato/Traktor history
- analysis: BPM and drop / breakdown detection → draft mix annotations without automatic snapping
  (`setcast analyze` ✓); downbeat detection is not built
- background engines: static image ✓, looping video ✓, per-play backgrounds ✓
  (`plays[].background`, selected from the first focused play), generative
- layout profiles / output targets: 16:9 ✓, 9:16 vertical ✓ (`@container (aspect-ratio < 1)` in the
  theme; the stage root is a size container), promo clips cut around `drop` events
  (`setcast clip` ✓)
- branding: logo, socials ticker, episode numbering, intro/outro
- side outputs: YouTube chapters + description from the timeline (`setcast chapters` ✓),
  thumbnail stills (`setcast still` ✓)
- live adapters: Pro DJ Link (prolink-connect), Denon StagelinQ, VirtualDJ OS2L, Serato session
  tail, MIDI/OSC; event-delay offset; convention: a cue named "DROP" becomes a `drop` event
- the live loop: `setcast live` records `event-log.jsonl` → `setcast render` regenerates the VOD

Community naming: `setcast-theme-*`, `setcast-viz-*`, `setcast-adapter-*`, `setcast-import-*`.

### Project resolution and orchestration

`setcast.yaml` (schema: `packages/core/src/config.ts`) → `loadProject(dir, {themes, probeDuration})` in
`@setcast/core/node` → `LoadedProject` with the `ResolvedProject` (plain JSON: absolute-free paths
relative to the project dir, merged modulation, theme CSS with fonts inlined as data URIs, base CSS,
visualizer config) and non-fatal configuration warnings. The CLI prints those warnings to stderr.
The renderer-owned audio probe runs during loading, before finite timeline normalization.
`ResolvedProject.envelope` is null after loading. A visualizer registered with `wholeSet: true`
draws the whole set from it, so the commands that render (`render`, `still`, `clip`, `preview`)
call `withSetEnvelope` after validating their flags: when `drawsWholeSet(project)`,
`readSetEnvelope` decodes the audio and `summarizeEnvelope` reduces it to at most 1200 points of
bass and high energy. The renderer adapter receives `ResolvedProject` as input props and nothing
else. Assets referenced
by `setcast.yaml` must live inside the project directory (the adapter serves it as the public dir).

Renderer adapter API (`@setcast/renderer-remotion`): `render(project, { projectDir, out, range?,
onProgress })`, `still(project, { projectDir, out, at? })` and `preview(project, { projectDir })`.
Entry file for the bundle: `packages/renderer-remotion/entry/index.tsx` (shipped as source;
Remotion's bundler compiles it).

### CSS contract

The stage root has class `setcast` plus `--mod-*` variables. Stable class names: `sc-stage`,
`sc-bg`, `sc-panel`, `sc-deck`, `sc-artist`, `sc-title`, `sc-label`, `sc-next`, `sc-spectrum`,
`sc-header`, `sc-clock`. `packages/core/css/base.css` is structural only (positions, sizes as
variables); themes own appearance. Theme variables: `--panel-bg`, `--panel-border`, `--accent`,
`--accent-2`, `--deck-a` … `--deck-d` (one signal color per deck), `--fg`, `--fg-dim`, `--blur`,
`--radius`, `--font-display`, `--font-mono`. Users can add `css: ./overrides.css` in
`setcast.yaml`; it is appended last.

base.css resolves `--deck` on each panel's optional `data-deck`. A-D keep their theme colors;
arbitrary deck labels are permitted and use the theme accent unless styled explicitly. The stage
has no global deck. It carries `data-presentation`, `data-current-plays`, `data-section` and
`data-shared-drop`. Its section and cue variables describe the mix.

Each `.sc-panel` has `data-play`, `data-focused`, `data-returning`, optional `data-deck`, local
`data-section`, `data-tail`, and `data-tags`. `--since-entry` and `--until-exit` describe its uninterrupted run.
Both stage and panels have scoped `--since-*`/`--until-*` for drop, breakdown, buildup and rewind,
`--drop-intensity`, `--drop-participants` and `--section-time`. Seconds cap at 60. Shaped
`--drop-flash`, `--rewind-flash`, `--tension` recompute locally, avoiding inherited mix cues.
The stage also has `--set-progress`, `--current-plays`, and optional `--beat`/`--bar`.

`--show` springs in at run start and follows `panel.dwell`/`panel.fade`; metadata changes do not
reset it. Themes use `--presence`, which follows show in playlist mode; in DJ mode it springs in,
holds for the run and eases out over its last 0.6 s, so DJ credits remain legible after dwell.
`--presence` sits on the panel's `.sc-slot`. In DJ mode base.css stacks the slots in play order,
anchored at the bottom, each as tall as `--presence` times its panel, so the stack opens and
closes smoothly (`--stack-gap`, `--slot-bleed`). The DJ stack is the CSS anchor `--contributors`,
which a theme uses to keep `.sc-next` clear of it. `.sc-contributors` shows up to four panels in
landscape or three in portrait, retains focused plays first, and adds an explicit overflow count
and accessible full list. There is no data-model concurrency limit.

Visualizers are SVG under one root class each, with `data-style` set to the block's `style`:
`.sc-spectrum` (bars are `rect`s in `.sc-spectrum-bars`, and with `peak` their markers are
`rect`s in `.sc-spectrum-peaks`; `style: line` draws `.sc-spectrum-line` over
`.sc-spectrum-area`) and `.sc-radial` (the ring is a `circle`, bars are `line`s; `style: line`
draws `.sc-radial-line` and `.sc-radial-area`, the band between it and the ring). base.css places
them and sizes them with `--spectrum-height` and `--radial-size`. `--radial-size` and
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
modes and filters.

`.sc-overview` is the whole set as a strip under the header (`--overview-top`, `--overview-height`):
`.sc-overview-high` above the middle line and `.sc-overview-bass` below it, the same two again
inside `.sc-overview-played`, clipped to the part that has played, one
`.sc-overview-mark[data-type]` per annotation or listing (`data-type="listing"`) and the `.sc-overview-head` playhead. SVG lines have no
stroke until a theme gives them one, so a theme shows exactly the event types it styles.

`.sc-meters` is HTML, not SVG: one `.sc-meter` per band (`data-band="bass"`) with its level in
`--level`, 0..1, holding `.sc-meter-bar` > `.sc-meter-level` and a `.sc-meter-label`. The theme
draws the meter from `--level`; base.css positions it (`--meters-top`, `--meters-height`) and,
when `segments` is not 0 (`data-segmented`), masks `.sc-meter-bar` into `--segments` cells.
With `peak`, each `.sc-meter` also carries `--peak` and its bar holds a `.sc-meter-peak`, which
base.css places as a hairline, or as the lit part of the top cell when segmented.

`.sc-next` shows the next listing group in playlist mode and next contribution-run group in DJ
mode, labelled "Next in tracklist", "Next entry" or "Returning". Its own `--until-next` drives
the theme's visibility. Never infer a next deck from missing hardware information.

## Roadmap (beyond v1)

- FOSS renderer `@setcast/renderer-browser`: Playwright + pinned Chromium renders frames from the
  same `RenderFrame`; FFmpeg subprocess muxes video + audio. Requires the AudioFeatures sidecar.
- AudioFeatures sidecar (FFmpeg → PCM → fft.js → per-frame bins), shared by both renderers.
- Live mode: `setcast live` (OBS browser source, hardware adapters, event log → VOD).
- Everything in the plugin registry list above.
- Generated per-project bundle entry so `plugins:` in `setcast.yaml` can pull npm plugins in.

## Decisions

- The finite mix model replaces the old tracks/events contract without compatibility aliases.
  `ResolvedProject.mix` is finalized before rendering. The renderer supplies the audio-duration
  probe to core/node, keeping core independent of Remotion and avoiding a second media probe stack.
- `setcast inspect --json` materializes all IDs in a normalized document; `--at` exports a query.
  Normalized JSON uses integer microseconds and is read with `readMixDocument`, not YAML parsing.
- Background selection follows the first focused play and changes immediately. There is no
  fabricated "previous track" during an overlap. DJ panels retain credits after dwell;
  `--presence` separates this layout policy from the deterministic per-run `--show` signal.
- A DJ slot's height is `calc-size(auto, size * var(--fit))` in block flow. Chrome ignores
  `calc-size()` heights on flex items, and `overflow-clip-margin` rejects `calc()`, so the bleed
  is a constant. The clip is on the slot rather than a `clip-path`, because a `clip-path`
  ancestor becomes the backdrop root and empties every panel's `backdrop-filter`.
- Built-in themes design their DJ layout explicitly (`[data-presentation='dj']` rules) instead
  of inheriting a shared grid. Focus changes emphasis (brightness, accent), never size, because
  automatic focus moves on every entrance and a size change there would jump.
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
- Remotion bundles with webpack (its own esbuild loader for TS/TSX); `rspack: true` exists and is
  the announced future default. Vite+ drives everything else. They coexist because the adapter's
  bundle entry is plain TSX resolved through package `exports` → `src/*.ts`. No `tsconfig paths`
  (Remotion's bundler ignores them); use package imports only.
- Preview: Remotion Studio spawned via `@remotion/cli` (`remotion studio <entry> --props ...
--public-dir <projectDir>`). There is no public programmatic Studio API.
- TypeScript 7.0.2 (tsgo). `erasableSyntaxOnly` is on so Node can strip types: no enums,
  namespaces, or parameter properties. Imports use explicit `.ts` extensions.
- Zod 4.4.3 for every schema. `yaml` 2.9.0 for YAML (maintained, spec-complete, no deps).
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
  working directory in the wrong order.
- Audio duration comes from `mediabunny` (`Input` + `UrlSource`, `getDurationFromMetadata()` with
  `computeDuration()` fallback) during project loading; Remotion's `getAudioDurationInSeconds`
  is deprecated in favor of it. mediabunny is MPL-2.0 and a plain dependency of the adapter.
- Renders pass `jpegQuality: 95` (Remotion defaults to 80) and `output.crf` (default 18). The
  intermediate frames the encoder reads are JPEGs, and the default look is a dark scene full of
  smooth gradients, blur and a vignette, which bands badly below ~90. Both are `output:` keys.
- Hardware encoding is opt-in with `output.hardwareAcceleration` (`disable`, `if-possible`,
  `required`) and requires `output.videoBitrate` (e.g. `12M`). Explicit CRF conflicts with bitrate
  or hardware encoding; the schema adds CRF 18 only when no bitrate is present. The adapter
  validates the same rules for direct API calls before browser work and passes `crf: null` for
  bitrate encoding. Studio receives the same encoding and JPEG quality settings as CLI renders.
  Remotion's `if-possible` fallback checks the encoder in its bundled FFmpeg; it does not recover
  from a device or driver failure after encoding starts.
- `output.gl` defaults to `auto`: ANGLE on macOS, Chromium's default elsewhere. `default` restores
  Chromium's own choice on any platform; explicit backend names pass through the adapter. The same
  setting applies to metadata, renders, stills, bundled thumbnails and Studio render settings.
  The backend stays out of `ResolvedProject`: it configures the renderer, not the scene.
- Procedural theme textures and the scaffold/demo background ship as pre-rendered PNGs, generated
  by `vp run rasterize-assets` with librsvg's `rsvg-convert`. SVGs remain the editable sources;
  ordinary rendering and `init` need no rasterizer dependency. The 2304x1296 background leaves
  room for the demo's zoom at 1080p; larger outputs can regenerate it or use the SVG directly.
  Keep geometric assets such as escapement's dial as SVG so their fine lines stay sharp.
- Long-exposure's scopes use two chained drop shadows. Each shadow filters the preceding result,
  so adding a third wide blur is expensive on these large SVGs. Keep all history traces and tune
  the two radii for the light-trail halo; compare both a drop flash and sustained playback.
- Playlist panels leave after `panel.dwell: 14` and `panel.fade: 1.2` by default. DJ panels keep
  credits visible, with focus controlling emphasis. Every entrance/dwell uses run start.
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
- Local Remotion bundles use `symlinkPublicDir` so subsequent renders do not copy source audio
  and previous outputs into each temporary bundle. Remotion falls back to copying on Windows.
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
- Meters are HTML with `--level` rather than SVG like the spectrum: a meter is a few boxes and a
  text label, which CSS lays out and styles more directly than SVG geometry and `<text>`.
- The vectorscope plots `(right - left, left + right) / √2`, the usual goniometer orientation:
  mono on the vertical axis, hard left leaning up-left. A point outside the circle is pulled onto
  it rather than clipped by the box. Both scopes draw straight segments through all 512 points;
  at that density a spline adds cost and no visible smoothness.
- The spectrogram is a canvas, the one visualizer that is not SVG or HTML: 120 columns of 64 bins
  is 7,680 cells a frame, too many DOM nodes. It repaints entirely in a layout effect every frame
  from `useAudioHistory`, so it keeps no state across frames, and takes its color from CSS
  `color` so appearance stays in the theme. Columns are placed by age, not index, so it scrolls
  smoothly between the 1/30 s grid moments.
- `peak` and `trail` read the audio history (`audioHistory`, the non-hook form of
  `useAudioHistory`) instead of remembering earlier frames, so every frame still renders on its
  own. A peak holds for `peak` seconds, then falls at `PEAK_FALL_SECONDS` (0.6) per full scale.
  Trails sit one wave length (1/30 s) apart, so consecutive traces are consecutive audio.
- The set envelope is read in Node before rendering, not in the browser: the browser only ever
  has 30 s of audio loaded, and a Node decode already exists. It decodes at 4 kHz with 0.05 s
  hops, which is enough for points that each cover seconds and keeps a two-hour set to about
  230 MB of samples; a two-hour MP3 reads in about 6.5 s. Only projects whose visualizers ask for
  it pay that, and `chapters`, `analyze` and `import` never do.

## Not yet decided

- Sidecar format for precomputed AudioFeatures (JSON first; binary layout later). `wave` is
  1024 floats per frame, far more than the rest; a renderer that has the PCM anyway should slice
  it at render time instead of storing it.
- Whether live mode renders via the same `Stage` in a browser source with a `RenderFrame` driven by
  `requestAnimationFrame` (likely yes) and how event-delay offset is configured.
- Plugin loading for npm plugins (generated bundle entry vs. config-time import map).
- Publishing layout. `vp pack` builds `dist/*.mjs` + `.d.mts` and `publishConfig.exports` points
  there, but two things are unresolved: the CLI `bin` imports `src/main.ts` (fine in the workspace,
  Node refuses to type-strip inside `node_modules`, so a published bin must import `dist`), and the
  Remotion bundle entry (`entry/index.tsx`) imports `src/Root.tsx`, which a published package would
  not ship. Decide when publishing becomes real; nothing in the dev loop depends on it.

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
