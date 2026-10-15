<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/setcast-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/setcast-logo-light.png">
    <img src="docs/assets/setcast-logo-light.png" alt="Setcast logo: a ray striking a vinyl record and reflecting as a spectrum" width="420">
  </picture>
</p>

# Setcast

Setcast turns a recorded DJ set into a video ready for YouTube. Give it the mix, the tracklist
and a background image, and it renders an MP4 in which the artist and title change with every
track, a clock runs through the set, and the visuals move with the music.

It is made for DJs who publish their mixes on YouTube and want more than a still image over the
audio, without spending an evening in a video editor for every set. You describe the set in one
YAML file and pick one of 15 themes. Themes are plain CSS, so if you can edit a stylesheet you can
change anything on screen, and you never need JavaScript. The default look is dark, sterile
sci-fi, made for neurofunk, techstep and jungle; the other themes range from a photocopied rave
flyer to the fluorescent display of a 90s CD deck.

[![One DJ set shown in each of Setcast's 11 built-in themes. Click to watch the video on YouTube.](docs/assets/setcast-themes-video.jpg)](https://www.youtube.com/watch?v=-emCbgmZilo)

▶ [Watch one set in all 11 themes on YouTube](https://www.youtube.com/watch?v=-emCbgmZilo) (5:31)

## What you get

- **A now-playing panel that follows the tracklist.** Artist, title and label change with each
  track, and the deck letter shows which deck is up. A header shows the set title and the clock.
  Turn on `tracklist:` to keep the previous and next tracks on screen as well, the playing ones
  marked.
- **Visuals that react to the music.** Spectrum bars, a radial ring, level meters, an
  oscilloscope, a vectorscope, a scrolling spectrogram and a strip showing the whole set, all
  driven by the bass, mids, highs and beat of your mix. The art can join in: its lamps and signs
  glow with the bass, and the bars can show the picture through them.
- **The moments of the set on screen.** Mark drops, breakdowns, buildups and rewinds, and the
  theme reacts with a flash, a shake or a tear in the picture. `setcast analyze` reads the mix,
  drafts the drops and breakdowns, and estimates the tempo, so beat-synced effects stay on the beat.
- **Everything the upload needs.** The YouTube description with chapters from your tracklist, a
  thumbnail, and 45-second promo clips cut around the drops. Render at 9:16 for Shorts and Reels.
- **Backgrounds that fit the set.** A still image or a looping video, optionally a different one
  for each track, crossfading at the track change. Themes measure each image and adjust its
  exposure, so bright art does not wash out a dark theme and dark art does not vanish into a
  textured one. A square cover, or landscape art in a vertical clip, is shown whole over a blurred
  copy of itself, and some themes take their accent colors from the art.
- **Tracklists you already have.** Import a plain `MM:SS Artist - Title` list or a `.cue` file.

## Themes

Switch themes with one line in `setcast.yaml` (`theme: bristol`), or try one without editing
anything: `setcast still --theme bristol`. `setcast still --theme all` grabs the same moment in
every theme, one image each, to see which one suits your art. Each theme brings its own
visualizers and reactions, so the name alone gives you the look as designed. A theme can also be
a path to your own `.css`.

| theme           | look                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `sterile-tech`  | the default: steel and frosted glass around your art, one rust accent, a scan per drop   |
| `escapement`    | white paper, your art through a band of cyan glass, pixel capitals, a beat-ticking dial  |
| `long-exposure` | a night shot of your art: its lamps flaring, one sodium-amber trail, lime lowercase      |
| `bristol`       | your art printed in teal and grey inks, a white contour, the set told in green stripes   |
| `patina`        | a worn, hand-tinted print cropped to its subject, tracked capitals, one string under it  |
| `quicksilver`   | your art in a cobalt glass orb, set in chrome that mirrors its colors, on bright silver  |
| `bunker`        | your art through an opening in a concrete wall, lit by a work lamp; hazard tape on drops |
| `vfd`           | a 90s deck's fluorescent display under your art: dot matrix, level meters (`--phosphor`) |
| `interference`  | your art in color on a corrupted signal: channels split with the bass, tears on the drop |
| `pirate`        | a photocopied rave flyer: grey copy, taped slips, a torn fluoro strip (`--fluoro`)       |
| `afterhours`    | warm and late: your art in amber evening light, its lamps glowing, credits on rose glass |
| `passe-partout` | your art untouched as a framed print on a wall in its colors, a museum label beside it   |
| `masthead`      | your art full bleed, the track set in its emptiest part like a magazine's cover lines    |
| `anamorphic`    | the set as a film: your art in a 2.39:1 band, the credits in the bars, drops open it     |
| `relief`        | the music as a ridgeline plot: lines in your art's colors, raised into its terrain       |

## Get started

Setcast is not on npm yet, so you run it from a clone of this repository. You need Node 26 and
[Vite+](https://vite.plus):

```sh
curl -fsSL https://vite.plus | bash       # installs vp
git clone https://github.com/razorjack/setcast && cd setcast
vp install
```

Try the demo set first:

```sh
vp run demo-assets                        # generates the demo audio
cd examples/demo && vp run render
```

That renders `examples/demo/out/demo.mp4` (2:34, 1080p30, h264 + aac). The first render
downloads Chrome Headless Shell (about 100 MB) once.

Then start your own project:

```sh
vp exec setcast init my-set               # asks for the title, the mix, the frame rate and a theme
cd my-set && vp exec setcast render
```

Setcast reads everything from the project directory, so put your mix inside it (for example
`my-set/assets/mix.wav`). `init --demo` fills the project with a generated 40-second demo track
instead. Inside the clone the command is `vp exec setcast`; the rest of this README writes it as
`setcast`, which is what `npm i -g @setcast/cli` will give you once Setcast is published.

> [!WARNING]
> Setcast renders the video frame by frame in a headless browser, so a full render takes a
> while. A one-hour set can take two hours or more, depending on your computer. Check the look
> on a slice first with `setcast render --range 1:00-1:30`, or a single frame with `setcast still`.

## Describe a set

A project is a directory:

```
my-set/
  setcast.yaml      # everything below
  assets/mix.wav    # your audio (wav, mp3, m4a, flac)
  assets/bg.png     # background art (png/jpg/svg, or mp4/mov/webm for a looping video)
```

```yaml
title: Sterile Session 01
audio: assets/mix.wav
background: assets/bg.png
backgroundFit: auto          # art of another shape: cover crops it, contain shows it whole
theme: sterile-tech          # built-in name, or a path to your own .css
bpm: 174                     # gives CSS --beat and --bar; `setcast analyze --write` fills it in
beatOffset: 0.12             # seconds to the first beat; analyze fills it in with bpm
output: { width: 1920, height: 1080, fps: 30, file: out/set.mp4, crf: 18, jpegQuality: 95, gl: auto }

presentation: {mode: auto}   # project-wide DJ layout if any contributions overlap
plays:
  - {id: first, at: 0:00, until: 4:40, artist: Noisia, title: Stigma, label: Vision}
  - id: second
    at: 4:12                 # editorial tracklist timestamp
    title: ID                # unknown artist and deck stay unspecified
    contributions:
      - {from: 3:50, until: end}

annotations:
  - {kind: drop, at: 1:04}
  - {kind: breakdown, at: 3:30}
  - {kind: drop, at: 4:20, participants: [first, second]}

modulation:                  # audio and timeline → CSS custom properties (--mod-<target>)
  - { source: bass, target: bg-zoom, range: [1, 1.06], curve: pow2, smooth: 0.08, when: drop }
  - { source: since:drop, target: flash, range: [0, 1], window: 0.8, curve: pow2 }
  - { source: beat, target: kick, curve: pow3, when: drop }   # 1 on every beat, needs bpm:

visualizer: { name: spectrum, bars: 48, gain: 1 }   # or a list, or leave it to the theme; see Visualizers
panel: { dwell: 14, fade: 1.2 }   # entrance dwell; false shows no panels, only the tracklist
tracklist: { before: 2, after: 2 }   # listings around the current one; true, false, or the counts
css: overrides.css           # optional, appended after the theme
```

Times accept `1:23`, `1:23.5`, `1:02:03` or nonnegative seconds. They normalize once to
integer microseconds. `until: end` resolves to the probed mix duration; intervals include the
start and exclude the end.

A simple `plays: [{at: 0, title: First}, {at: 200, title: Second}]` is enough. A listing supplies
fallback participation until the next strictly later listing or mix end. Add `until` for an
overlap, or replace fallback timing with `contributions` for teases and returns. Contributions
never move the listing or its chapter. An overlay with only contributions creates no chapter
and cannot truncate another play. Tied listings create concurrent credits and one joined chapter.

Use `recordings: {name: {title: ...}}` and `recording: name` when independently manipulated
copies share a recording. Otherwise each inline row gets its own recording identity. Optional
deck labels belong to contribution intervals; Setcast never assigns them automatically.

`presentation.mode` can force `playlist` or `dj` without changing the timeline. DJ mode shows
current contributors; playlist mode emphasizes one. Automatic focus selects the latest current
non-tail run. `focus: [{at: 0, plays: [first]}]` pins emphasis until that run ends; an empty list
restores automatic focus. Tags such as `tease` describe participation but never change focus.

See the [complete authoring contract](docs/dj-mix-model.md) for scopes, shared drops, tails,
validation and evidence. [Theme and plugin APIs](docs/theme-plugin-contract.md) describe the
renderer and CSS contracts. `setcast inspect --at 4:20` explains the resolved credits and
boundary origins; `--json` exports the finite document with IDs.

`output.gl: auto` uses ANGLE on macOS and lets Chromium choose its backend elsewhere.
Set `gl: default` to use Chromium's choice on macOS too, or select `angle`, `egl`,
`swiftshader`, `swangle`, `vulkan` or `angle-egl` explicitly. This applies to renders,
clips, stills and Studio's render settings. Software backends can be useful on machines
without a GPU, but can make glows and other effects slower.

Video encoding uses software H.264 with `crf: 18` by default. To try hardware encoding
(VideoToolbox on macOS, NVENC on supported NVIDIA systems), configure a bitrate instead:

```yaml
output:
  hardwareAcceleration: if-possible
  videoBitrate: 12M
```

Remove any explicit `crf` from that output block. `videoBitrate` accepts positive values in
megabits/s (`12M`) or kilobits/s (`12000k`); it also works with software encoding.
`hardwareAcceleration` accepts `disable` (default), `if-possible` or `required`. With
`if-possible`, Remotion falls back to software if its FFmpeg build lacks the hardware encoder;
`required` fails instead. Device or driver failures can still stop an encode in either mode.
These settings apply to renders, clips and Studio's render settings.

Hardware encoding speeds up compression, while frame rendering still uses Chromium. A bitrate
of `12M` is a starting point for 1080p/30 fps, not a quality equivalent to CRF 18. Compare a short
slice for dark gradients, moving detail and file size before exporting a full set.

For faster exports with small differences in fine texture and gradients, set:

```yaml
output:
  profile: fast
```

The `fast` profile uses `jpegQuality: 92` and `x264Preset: veryfast`, keeping resolution,
frame rate and CRF unchanged. The default `standard` profile uses JPEG quality 95 and
the `medium` preset. Explicit `jpegQuality`, `x264Preset` and `crf` settings take precedence.
These settings apply to renders, clips and Studio exports. With hardware encoding, `fast`
changes only JPEG quality; omit `x264Preset`, which configures software encoding only.
The [rendering benchmarks](docs/render-performance.md) measured 14–25% shorter exports
with this combination on the tested clips. Actual gains depend on the theme and machine.

CLI renders and clips longer than 60 seconds use 60-second chunks by default. This bounds
the frame bookkeeping and temporary JPEG files held by each render batch. Timeline positions,
audio-reactive motion and background video loops keep their original timing. The master
soundtrack is encoded once alongside the video; the final file joins the encoded streams
without another encode or separate audio segments at chunk boundaries.

Set `output.chunkSeconds: 30` for smaller batches, or `0` to disable chunking. Accepted values
are whole seconds from 0 to 60. Exports that fit in one chunk use the original rendering path.
Chunks can change compression slightly near joins and add startup overhead; their main benefit
is keeping resource use predictable on long sets. Encoded chunks and the soundtrack stay beside
the destination in a temporary directory until assembly completes, then are removed. A failed
chunked export preserves an existing output file. Studio exports use Remotion's own rendering
pipeline and do not use this chunk setting.

The bundled procedural textures and default background are pre-rendered PNGs, so exporting
does not repeatedly evaluate SVG noise and blur. SVG backgrounds still work; for an existing
project, pre-render complex static artwork to a bitmap with enough pixels for the output and
its largest zoom. The default PNG is 2304×1296 for 1080p output with zoom headroom. Editable
SVG sources remain in the repository. After changing them, regenerate the shipped assets with
`vp run rasterize-assets` (requires `rsvg-convert` from librsvg, only for regeneration).

## Commands

| command            | does                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `setcast init`     | scaffolds a project; `--demo` includes a generated demo track                                    |
| `setcast import`   | turns a tracklist file (plain text or `.cue`) into `plays:` with source evidence; `--write` replaces that list after validation |
| `setcast analyze`  | reads the audio and drafts mix drop and breakdown annotations plus tempo, without snapping; `--write` accepts and merges them |
| `setcast preview`  | opens the set in Remotion Studio                                                                 |
| `setcast render`   | renders the MP4; `--range A-B` renders a slice, `--bundle` also writes the thumbnail and description |
| `setcast clip`     | cuts a 45 s promo clip around a drop; `--at 1:04` picks one, `--all` cuts one per drop            |
| `setcast still`    | renders one frame as an image, for the thumbnail; `--at 1:04` picks the moment, `--theme all` grabs one per theme |
| `setcast inspect`  | explains contribution origins; `--at` queries a moment, `--json` exports normalized data |
| `setcast chapters` | prints the YouTube description with chapters and warns about anything that would stop YouTube showing them |
| `setcast live`     | planned: live overlay mode                                                                       |

`preview`, `render`, `clip` and `still` take `--theme <name>` to try a theme without editing
`setcast.yaml`, e.g. `setcast still --theme bristol --out bristol.jpg`. Run
`setcast <command> --help` for every option.

## Visualizers

`visualizer:` takes one block or a list of them. A list draws every entry in order, so later
entries sit on top; `[]` draws none. Every key except `name` is optional. Without the key, the
project draws what its theme is designed around (a spectrum for a theme that names nothing).

```yaml
visualizer:
  - { name: spectrum, style: line }
  - { name: radial, bars: 48, spin: 0 }
```

| name           | draws                                                                               | keys and defaults                                                                                          |
| -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `spectrum`     | mirrored bars along the bottom, bass centered                                       | `style: bars` (or `line`), `bars: 48`, `gain: 1`, `floor: 0.02`, `gap: 0.5`, `segments: 0` (cells per bar), `peak: 0`, `fill: theme` (or `art`) |
| `radial`       | bars around a ring, bass at the bottom                                              | `style: bars` (or `line`), `bars: 40`, `radius: 0.3`, `length: 0.18`, `gain: 1`, `floor: 0.03`, `spin: 2`, `fill: theme` (or `art`) |
| `meters`       | level meters on the left                                                            | `bands: [bass, mids, highs, rms]` (also `onset`), `gain: 1`, `floor: 0`, `segments: 16`, `peak: 0`          |
| `oscilloscope` | the waveform as one trace near the bottom                                           | `gain: 1`, `trail: 0`                                                                                      |
| `vectorscope`  | left against right in a circle, inside the radial ring                              | `gain: 1`, `trail: 0`                                                                                      |
| `spectrogram`  | the last seconds of spectrum scrolling left, bass at the bottom                     | `seconds: 4` (at most 8), `gain: 1`                                                                        |
| `ridgeline`    | the last seconds of spectrum as stacked lines rising up the frame, over the art's relief | `lines: 44`, `seconds: 6` (at most 8), `gain: 1`, `relief: 0.5` (0 to 1), `spread: 0.7`, `fill: theme` (or `art`) |
| `overview`     | the whole set as a strip under the header, with track and drop marks and a playhead | none                                                                                                       |
| `bloom`        | the art's own lamps, signs and suns glowing with the music                          | `bands: [bass, highs]` (one or two), `gain: 1`, `lights: 0.05` (share of the art), `radius: 0.015`, `smooth: 0.1` |

`gain` scales the levels (real masters are louder in the highs than the demo), `floor` keeps a
baseline in silence, and `spin` is degrees per second. `peak` is the seconds a marker holds each
bar's highest level before it falls, as on a hi-fi analyzer (`0` draws none, at most 4). The
scopes draw the last 1/30 s of audio; `trail: 6` also draws the six 1/30 s before it behind the
current trace, for the theme to fade into an afterimage (at most 12). `fill: art` shows your
background art through the bars, the area under the line or the band around the ring, so the
music opens windows onto the picture; the theme decides how the art looks there, typically
brighter and more colorful than the background around it.
The ridgeline stacks the spectrum of the last seconds as lines, the newest at the bottom, each
rising as it ages, like a ridgeline plot. Your art raises the lines where it is bright
(`relief`), so in silence they draw a relief of the art, and every set gets its own terrain.
`spread` is the share of the width the spectrum spans, the bass under the art's subject, and
`fill: art` draws each line in the art's colors along it.
The vectorscope shows stereo width, so a mono mix draws a vertical line; so does the demo, which
has the same audio in both channels. The overview reads the whole audio file before rendering,
which takes a few seconds for a long set. Bloom finds the lights of an image background, the
parts clearly brighter than their surroundings, and lights them with the bands: the first band
the lights in the art's main color and the white ones, the second those in its second color. A
video background or a set without art has nothing for it to light.

Placement and appearance are CSS. Set `--radial-size` and `--vectorscope-size` on `.setcast`,
which keeps the vectorscope centered in the ring, or `--spectrum-height`, `--meters-top`,
`--oscilloscope-height`, `--spectrogram-height`, `--ridgeline-height` and `--overview-height`, or restyle
`.sc-spectrum`, `.sc-radial`, `.sc-meters`, `.sc-oscilloscope`, `.sc-vectorscope`,
`.sc-spectrogram`, `.sc-ridgeline` and `.sc-overview` (see [AGENTS.md](AGENTS.md#css-contract) for their elements).
The spectrogram is a canvas: its CSS `color` is the color of a full-strength cell.

## Tracklist

`tracklist: true` keeps a short tracklist on screen: the two listings before the current one,
the current one and the two after it, gliding on at each new listing. Every built-in theme styles
it in its own way and places it clear of its panels. Themes that can set it outside your art show
it without being asked: anamorphic in its letterbox bar, escapement on its paper, patina in its
header line and passe-partout on the gallery wall; `tracklist: false` hides it there.
`tracklist: { before: 4, after: 0 }` sets the counts. The list replaces the "next" card, so
`after: 0` keeps upcoming tracks a surprise. A row is marked as playing while its track is
audible, so in a DJ blend both rows light up, in their deck colors.

The list shows `plays:` rows that have an `at` time. A tease or a loop with only `contributions:`
never becomes a row. Style it with `.sc-tracklist`, `.sc-tracklist-row[data-state='current']`
and the variables in the [CSS contract](docs/theme-plugin-contract.md#tracklist).

With the list on screen, the now-playing panel does not repeat it. A panel announces each track
as it comes in, for `panel.dwell` seconds, and then leaves the credit to the list, in DJ mode too.
A tease or a loop that the list does not show keeps its panel while it plays. `panel: { dwell: 0 }`
keeps the panels up the whole time, and `panel: false` shows no panels at all, so the list is the
only credit; Setcast then warns about plays without an `at` time, which nothing would credit.

## Customize without JavaScript

Themes are CSS. To adjust a built-in theme, set its variables (`--accent`, `--deck-a`,
`--panel-bg`, `--blur`, `--font-display`, …) or restyle any `.sc-*` class in a `css:` file. To
write your own, copy a theme's `theme.css` into the project and point `theme:` at it; its `url()`s
point at `../fonts` and `../textures` in `packages/themes`, so copy what it uses or swap in your
own. `vp run theme-stills [dir] --at 1:51` renders the same moment in every theme and tiles them
into `out/themes/contact-*.jpg`, which helps when comparing.

Modulation routes expose audio as `--mod-<target>` variables, so
`box-shadow: 0 0 calc(var(--mod-panel-glow) * 60px) var(--accent)` reacts to the music with no
code. The stage root also carries the timeline itself – `data-section`, `data-current-plays`,
`--set-progress`, and seconds in `--since-drop`, `--until-drop`, `--until-breakdown`,
`--since-rewind`, `--section-time` and friends – so `clamp(0, 1 - var(--since-drop) / 0.7, 1)` is
a flash on a mix drop, `width: calc(var(--set-progress) * 100%)` is a progress bar, and with
`bpm:` set, `--beat` and `--bar` run 0..1 on the grid so
`scale(calc(1 + 0.4 * (1 - var(--beat))))` pulses in time.

Each play panel has its own `data-play`, optional `data-deck`, local `data-section`, and
`--since-entry`. A route with `scope: play` reads that panel's local cues and writes its own
`--mod-*` values. Shared drops reach every named participant; master audio features remain
shared. The stage has no single global deck. `data-background` on the stage is `none`, `image` or
`video`, so a theme can style a set without art differently from one with it. For an image it
also carries `--bg-luma`, the art's mean brightness, and `--bg-color-1` and `--bg-color-2`, its two
most prominent hues. Each built-in theme corrects the art's exposure by `--bg-correction`, from 0
(the art as it is) to 1 (brought fully to the brightness the theme is designed for), so
`.setcast { --bg-correction: 0; }` in your `css:` file shows your art untouched. sterile-tech takes
its accents from the art's hues; `.setcast { --bg-accent: initial; --bg-accent-2: initial; }`
keeps its own colors. The header, the clock, each panel and up
next also carry `--bg-luma-behind`, the brightness of the art behind that element, so a theme can
darken a text shadow or a panel only where bright art would wash it out; sterile-tech does.
`--bg-detail-behind` says how busy the art is there. `data-bg-calm` names the emptiest part of
the art (`top-left`, `bottom-right`, …) and `--bg-focus-x` and `--bg-focus-y` where its subject
sits. See the [CSS contract](docs/theme-plugin-contract.md).

With `backgroundFit: cover`, art of another shape is cropped to the frame. When the subject sits
off center, keep it in frame with `.sc-bg-img { object-position: 70% 50%; }` in your `css:` file.

Vertical output is `output: { width: 1080, height: 1920 }`. The stage is a CSS size container, so
a theme adapts with `@container (aspect-ratio < 1) { ... }` (sterile-tech does). Plugins
(visualizers, importers, themes as npm packages) are the escape hatch for the rest.

## Excerpts from longer mixes

For an excerpt from a longer mix, set `clockOffset: 14:03` to show the original mix time.
A 5:31 excerpt then opens at `14:03 / 19:34`. The default is `0`; seconds and timecodes
are accepted. This changes only the displayed clock and endpoint. Play and annotation times,
`beatOffset`, `--range`, `--at`, and YouTube chapters still use the audio file's own timeline.
Set `clockTotal: 56:06` to replace the displayed endpoint with the full mix duration, showing
`14:03 / 56:06`. This accepts a positive duration in seconds or as a timecode and does not
extend the rendered video.
## How it works

The finite mix document stores recordings, plays, credited intervals, editorial listings,
annotations and focus directives. An indexed timeline projects them at any time. A play can
enter, leave and return; any number can overlap. Annotations describe music without changing
participation. Audio features drive CSS through a modulation matrix.

Every frame derives from the finalized document and original mix time, including render slices.
The renderer owns frame delivery; Setcast owns the timeline, motion and component contract.
Live capture remains future work. Reproducing a historical live display would also require
observation times and corrections, beyond the finalized offline document.

## Renderer

Setcast v1 renders with [Remotion](https://www.remotion.dev), isolated in one adapter package.
Nothing else in the project imports Remotion (the linter and a dependency-graph check enforce
it), so the renderer can be replaced; a Playwright + FFmpeg renderer is planned. Remotion has its
own [license terms](https://www.remotion.dev/license); check whether they apply to you.

## Develop

See [AGENTS.md](AGENTS.md) for the architecture, contracts, decisions, and workflow.
`vp check`, `vp test`, `vp run smoke` are the loop.

MIT © Jacek Galanciak
