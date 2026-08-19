# Setcast – agent guide

Setcast is an event-driven visual engine for DJ sets. It turns a recorded set (audio file +
tracklist + background art) into a broadcast-quality MP4 for YouTube: a themeable, CSS-styled UI
with a frosted-glass "now playing" panel, deck indicators, and audio-reactive spectral
visualization. Default aesthetic: dark, sterile sci-fi / rusty tech (neurofunk, techstep, jungle).
Everything is a timestamped event on a single timeline, which later enables live mode: the same
components rendering as an OBS browser-source overlay during Twitch streams, driven by real-time
events from DJ hardware, recording an event log that regenerates the polished VOD afterward
("stream once, publish twice"). Live mode is not built yet; the architecture anticipates it.

This project is engineered agentically. This file is the map. Read it fully before changing
anything; update it when you make a non-obvious choice (Decisions) or discover a gotcha.

## Quick orientation

```
packages/core               @setcast/core – event timeline, schemas, RenderFrame contract,
                            hooks, interpolate/spring, media wrappers, modulation, registry,
                            importers, project loading (node entry), built-in components
packages/renderer-remotion  @setcast/renderer-remotion – the ONLY package that imports Remotion
packages/cli                @setcast/cli – the `setcast` binary; thin; owns terminal UX
packages/themes             @setcast/themes – built-in themes (sterile-tech)
examples/demo               runnable demo project (setcast.yaml, generated audio, background)
scripts/                    repo tasks: smoke render, Remotion-ban check, demo asset generation
```

Entry points of `@setcast/core`:

- `@setcast/core` – isomorphic, pure: events, timeline, motion, modulation, audio types,
  config schema, importers, registry. No `node:*` imports, no React.
- `@setcast/core/react` – React: `RenderFrame` context + hooks, `Img`/`Video`/`useAsset`,
  built-in components (`Stage`, `Background`, `NowPlaying`, `Spectrum`), visualizer registry.
- `@setcast/core/node` – Node only: `loadProject(dir)`, theme/CSS resolution, error formatting.

Packages point `exports` at `src/*.ts`; Node 26 runs TypeScript sources directly (type stripping),
so there is no build step in development. `vp pack` builds `dist/` for publishing
(`publishConfig.exports`). Do not reintroduce a dev build step.

## Workflow

Prerequisites: the official `vp` binary (`curl -fsSL https://vite.plus | bash`), Node 26.7.0
(`.node-version`; `mise` and `vp env` both honor it), ffmpeg optional (smoke frame check).

```
vp install                 # install workspace (pnpm under the hood)
vp check                   # oxfmt + oxlint + type check (tsgo). Must be green. `vp check --fix`
vp test                    # vitest, all packages, from the root
vp run demo-assets         # synthesize examples/demo audio (gitignored, deterministic)
vp run smoke               # renders 3 s of the demo and validates the MP4 (audio + motion)
vp run ban-check           # proves no Remotion in plugin-facing dependency graphs
vp run ready               # check + test + smoke (what CI runs)
cd examples/demo && vp run render [-- --range 1:00-1:10]   # full render / slice
cd examples/demo && vp run preview                          # Remotion Studio
```

`vp <name>` runs a built-in; `vp run <name>` runs a package script or `vite.config.ts` task.
Inner loop for an agent: `vp check && vp test`. Before declaring render work done: `vp run smoke`.

Do NOT use a global `vite-plus` from `npm i -g` – its bundled Vitest is a second instance and
every test fails with "Vitest failed to find the current suite". Use the official `vp` binary.

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
   `{ frame, fps, timeSeconds, audio: AudioFeatures, events: EventState, composition:
CompositionState, modulation }`. Components consume it via Setcast hooks: `useFrame`, `useTime`,
   `useAudioFeatures`, `useEventState`, `useModulation`, plus Setcast-owned `interpolate`, `spring`,
   `ease`, `impulse`, `rampUp` (thin math in `packages/core/src/motion.ts`; never re-export
   Remotion's). The Remotion adapter translates `useCurrentFrame()` into a `RenderFrame` at the
   composition root; a future renderer feeds the identical `RenderFrame` from its own loop.
3. **Media goes through Setcast wrappers.** Plugins use `Img`, `Video`, and `useAsset()` from
   `@setcast/core/react` ("this frame isn't ready until the asset is"). The adapter binds them via
   `RendererBindings` (`hold(label) => release`) mapped to Remotion's `delayRender`/`continueRender`
   today, to a frame-ready handshake in a future renderer.
4. **Time-sensitive state is explicit, CSS owns appearance.** Never rely on the browser being
   "3.2 s into a CSS animation". Motion values resolve from `RenderFrame` in code and flow to CSS via
   custom properties (`style={{ '--bg-zoom': zoom }}`). CSS keeps full power over layout, appearance,
   and transitions of appearance. That is a product value, not an implementation detail.
5. **Remotion is a dependency of the adapter only** (peer dependency there), so `@setcast/core` and
   every plugin are pure-MIT artifacts with no source-available code in their tree. Renderer
   selection is plain config (`renderer: remotion`; the only value in v1). Never gate or detect who
   the user is; the README notes neutrally that Remotion has its own license terms, with a link.

## Architecture

### Event timeline (the core abstraction)

A set is a sorted list of typed, timestamped events (`packages/core/src/events.ts`). Types:
`track_start` (title, artist, label?, deck?), `drop` (intensity), `double_drop`, `breakdown`,
`buildup`, `rewind`, `switch` (deck), `chapter` (title). `time` is seconds; YAML accepts `1:23`,
`1:23.5`, `1:02:03`, or plain seconds (`TimeSchema`). The schema is the most stable public
contract: add types, never rename or remove.

`Timeline.at(time)` returns `EventState`: `all`, `track`, `trackIndex`, `last[type]`, `next[type]`,
`section` (latest of drop/double_drop/breakdown/buildup) and `sectionStart`. Helpers `since()`,
`until()`. Every visual behavior derives from this (trigger: `since(state,'drop',t)` small; sustain:
`section === 'drop'`; ramp: `until(state,'drop',t)`).

In `setcast.yaml`, `tracks:` is sugar: each entry becomes a `track_start` event; `events:` holds
everything else. Both land on one timeline. Tracks without `deck` alternate A/B.

### Modulation matrix

`packages/core/src/modulation.ts`. Routes: `{ source, target, range, curve, smooth, when }`.
Sources: `bass | mids | highs | rms | onset` (all 0..1). Target names are kebab-case and become CSS
custom properties `--mod-<target>` on the stage root, so themes consume any modulation without JS.
`range: [a, b]` maps source 0..1 to a..b; `curve`: `linear | sqrt | pow2 | pow3 | smooth`;
`smooth` seconds of trailing recency-weighted average (frame-independent: it re-samples the audio
analyzer at earlier times, no state across frames); `when: drop` gates a route to a section (rests
at `range[0]` otherwise). Later routes override earlier ones with the same target; a theme ships a
default patch, the project's `modulation:` list is appended after it.

### RenderFrame and hooks

`packages/core/src/react/frame.tsx`. `RenderFrame = { frame, fps, timeSeconds, audio, events,
composition, modulation }`. `CompositionState = { width, height, durationSeconds, project }` where
`project` is the `ResolvedProject` (everything the CLI resolved: title, tracks/events, theme CSS,
visualizer config, asset paths). Hooks: `useFrame`, `useTime`, `useAudioFeatures`, `useEventState`,
`useModulation`, `useComposition`. The adapter wraps the scene in `<FrameProvider frame={...}>`.

### AudioFeatures (the seam)

`packages/core/src/audio.ts`. `AudioFeatures = { bass, mids, highs, rms, onset, bins[64] }`, all
0..1; `bins` are log-spaced and tilt-flattened (raw FFT is bass-heavy). `AudioAnalyzer =
{ featuresAt(time) }` is what the adapter provides; `featuresFromSpectrum()` turns a linear
magnitude spectrum into features and is pure (tested). v1 implementation lives inside the Remotion
adapter (`useWindowedAudioData` + `visualizeAudio`). Successor (roadmap): FFmpeg subprocess →
streamed PCM → fft.js → precomputed sidecar per frame (JSON first, binary later). Live mode later:
Web Audio `AnalyserNode` feeding the same interface. FFmpeg policy: **subprocess only, never
linked**; keeps MIT Setcast cleanly separate from (L)GPL FFmpeg builds.

### Media wrappers and readiness

`packages/core/src/react/renderer.tsx`. `RendererBindings = { name, Img, Video, hold }`.
`Img`/`Video` are the adapter's components; `useAsset(src)` preloads and holds the frame until
loaded; `useFontsReady()` holds until `document.fonts.ready`. The default bindings (no adapter)
are plain `<img>`/`<video>` with a no-op `hold`, used in tests.

### Plugin registry

`packages/core/src/registry.ts`: `Registry<T>` (`add`, `get` with a helpful error listing known
names, `names`). Instances: `importers` (`@setcast/core`), `visualizers` (`@setcast/core/react`).
Each plugin kind is a small interface plus a Zod schema for its config. Extension points (roadmap
list; implemented today: visualizer, theme, tracklist importer):

- visualizers `(RenderFrame, config) → JSX` (spectrum ✓, radial)
- themes: CSS variables + fonts + default modulation patch + layout (sterile-tech ✓; a bare `.css`
  path is also a valid theme)
- tracklist importers: plain "MM:SS Artist - Title" ✓, Rekordbox/Serato/Traktor history, `.cue`,
  `ID - ID` dubs ✓
- analysis: beat/onset/BPM, automatic drop detection → draft events (`setcast analyze` is a stub)
- background engines: static ✓, per-track slideshow, looping video, generative
- layout profiles / output targets: 16:9 ✓, 9:16 vertical, auto-cut 30–60 s promo clips centered
  on `drop` events
- branding: logo, socials ticker, episode numbering, intro/outro
- side outputs: YouTube chapters + description from the timeline
- live adapters: Pro DJ Link (prolink-connect), Denon StagelinQ, VirtualDJ OS2L, Serato session
  tail, MIDI/OSC; event-delay offset; convention: a cue named "DROP" becomes a `drop` event
- the live loop: `setcast live` records `event-log.jsonl` → `setcast render` regenerates the VOD

Community naming: `setcast-theme-*`, `setcast-viz-*`, `setcast-adapter-*`, `setcast-import-*`.

### Project resolution and orchestration

`setcast.yaml` (schema: `packages/core/src/config.ts`) → `loadProject(dir)` in
`@setcast/core/node` → `ResolvedProject` (plain JSON: absolute-free paths relative to the project
dir, merged modulation, theme CSS with fonts inlined as data URIs, base CSS, visualizer config).
The renderer adapter receives `ResolvedProject` as input props and nothing else. Assets referenced
by `setcast.yaml` must live inside the project directory (the adapter serves it as the public dir).

Renderer adapter API (`@setcast/renderer-remotion`): `render(project, { projectDir, out, range?,
onProgress })` and `preview(project, { projectDir })`. Entry file for the bundle:
`packages/renderer-remotion/entry/index.tsx` (shipped as source; Remotion's bundler compiles it).

### CSS contract

The stage root has class `setcast` plus `--mod-*` variables. Stable class names: `sc-stage`,
`sc-bg`, `sc-panel`, `sc-deck`, `sc-artist`, `sc-title`, `sc-label`, `sc-spectrum`, `sc-header`,
`sc-clock`. `packages/core/css/base.css` is structural only (positions, sizes as variables);
themes own appearance. Theme variables: `--panel-bg`, `--panel-border`, `--accent`, `--accent-2`,
`--fg`, `--fg-dim`, `--blur`, `--radius`, `--font-display`, `--font-mono`. Users can add
`css: ./overrides.css` in `setcast.yaml`; it is appended last.

## Roadmap (beyond v1)

- FOSS renderer `@setcast/renderer-browser`: Playwright + pinned Chromium renders frames from the
  same `RenderFrame`; FFmpeg subprocess muxes video + audio. Requires the AudioFeatures sidecar.
- AudioFeatures sidecar (FFmpeg → PCM → fft.js → per-frame bins), shared by both renderers.
- Live mode: `setcast live` (OBS browser source, hardware adapters, event log → VOD).
- Everything in the plugin registry list above.
- Generated per-project bundle entry so `plugins:` in `setcast.yaml` can pull npm plugins in.

## Decisions

Versions verified 2026-08-19 (do not re-litigate; bump deliberately):

- Node 26.7.0 pinned (`.node-version`). Remotion 4.0.513 supports Node 26 (browser download fix
  landed in 4.0.463). Vite+ 0.2.9 requires `>=24.11.0`. Everything runs on Node 26.
- Vite+ 0.2.9 (`vp`), pnpm 11.22.0 under it (`devEngines.packageManager`). One root
  `vite.config.ts` holds fmt/lint/test/run config; per-package `vite.config.ts` only holds `pack`.
  `vite-plus` is a devDependency of every package (the template convention) via the pnpm catalog.
- Remotion 4.0.513 pinned exactly (peer dependency of the adapter). Rendering: `@remotion/bundler`
  `bundle({ entryPoint, publicDir: projectDir })` → `selectComposition` → `renderMedia({ codec:
'h264', audioCodec: 'aac', frameRange })`. Audio in the composition: `<Audio>` from
  `@remotion/media` (Mediabunny-backed, the recommended tag; `remotion`'s `<Audio>` is deprecated
  in favor of `Html5Audio`). Duration: `calculateMetadata` computes `durationInFrames` from the
  audio file. Windowed audio: `useWindowedAudioData` from `@remotion/media-utils` supports all
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
- Spectrum is SVG, not canvas: bars are `<rect>`s so themes style them in CSS (`fill`, `filter`),
  output is resolution independent, and it stays renderer neutral. 128 rects per frame is cheap.
- Theme fonts are vendored OFL `.woff2` files inlined as data URIs into the theme CSS string at
  project resolution; renders never touch the network and the scene gets one self-contained CSS
  string.
- `RenderFrame.modulation` is a top-level field (not part of the original six) because it is
  resolved per frame from audio + events and is the bridge to CSS.
- Demo audio is synthesized by `scripts/make-demo-assets.ts` in pure Node (deterministic, no
  ffmpeg), written as WAV, and gitignored; the background is a committed SVG. Fixtures in tests are
  inline strings.
- Package `exports` → `src/*.ts`, `publishConfig.exports` → `dist/*.js`. Workspace development runs
  TypeScript sources directly on Node 26.

## Not yet decided

- Sidecar format for precomputed AudioFeatures (JSON first; binary layout later).
- Whether live mode renders via the same `Stage` in a browser source with a `RenderFrame` driven by
  `requestAnimationFrame` (likely yes) and how event-delay offset is configured.
- Per-track backgrounds: config shape (`tracks[].background`?) and crossfade semantics.
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
- **Short names**, never ambiguous ones.
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
- **Errors state what's wrong and what to do.** They are read by agents as often as humans.
- No em dashes in prose; use `–`. No AI attribution in commits.
