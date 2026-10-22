# Theme and plugin contract

Setcast's offline domain is a finite `MixDocument`. The YAML authoring contract and its
validation rules are in [dj-mix-model.md](dj-mix-model.md). This replaces the unreleased
single-track contract; there are no compatibility aliases.

## Domain and renderer APIs

`@setcast/core` exports `normalizeMix(authoring, durationSeconds)`,
`readMixDocument(json)`, `Timeline`, `MixDocument`, `MixState`, and `CurrentPlay`.
`normalizeMix` takes authoring seconds or timecodes. `readMixDocument` takes normalized JSON
with safe integer microseconds and validates its structure and references. Never feed a
normalized document back to `normalizeMix`: these are different input formats.

`Timeline` indexes one cloned document revision. Construct another instance when the document
changes. `at(timeSeconds)` supports direct access, forward playback and reverse scrubbing;
it rejects negative times and times at or after the document duration. Intervals and spans
are half open. Membership at a boundary is the membership after that boundary.

`MixState` exposes `currentPlays`, `focusPlays`, `mixSection`, `activeAnnotations`,
`nextEntries`, `nextListings`, `listings`, and `recordingCount`, `playCount`, `listingCount`,
`currentPlayCount`. Each current play contains `play`, `recording`, `contribution`, `run`,
optional `deck`, and `section`. A run has `id`, `play`, `from`, `until`, and `returning`.
Section state has `kind` and `start`, or is null. All of these times are microseconds.

`lastAnnotations(state, kind, scope)` and `nextAnnotations(state, kind, scope)` return the
nearest timestamp group in original annotation order. Scope is `'mix'` by default, or
`{play: 'play-id'}`. Local history can be queried even during a contribution gap. Mix drops
with participants are indexed at the mix scope and at each participant's scope; other mix
annotations are not propagated. Last includes the query instant, next is strictly later.
`sinceAnnotation` and `untilAnnotation` return seconds, or Infinity for an absent cue. They
choose the first annotation in a tied group and accept an optional fourth argument, a run,
which restricts local visual reactions to that run. Persistent local sections also reset at
a run's end. Descriptive tags never affect any of these rules.

`ResolvedProject.mix` holds the document, and `ResolvedProject.presentation` is the resolved
`playlist` or `dj` mode. `loadProject(dir, {themes, probeDuration})` validates assets, calls the
renderer-owned `probeDuration(audioPath, projectDir)` function, and compiles the timeline before
returning. Theme CSS and the visualizer configuration remain outside the domain document.

The renderer supplies `RenderFrame` through `FrameProvider`:

```ts
{ frame, fps, timeSeconds, audio, analyzer, mix, composition, modulation }
```

React components consume `useMixState()`, `useFrame()`, `useTime()`, `useComposition()`,
`useAudioFeatures()`, `useAudioHistory()` and `useModulation()` from `@setcast/core/react`.
`timeSeconds` uses the original mix clock, including during a render slice. `composition`
contains `width`, `height`, `durationSeconds`, the resolved `project` and optional `performance`
values (`intensity`, `brightness`, both defaulting to 1). Audio features,
waveforms and history describe the mixed master only. There is no per-play audio or meter.
Media still uses Setcast's `Img`, `Video`, `useAsset` and renderer readiness bindings.

## CSS state

`Stage` wraps the theme's `.setcast.sc-stage` in `.sc-output`. The outer wrapper owns an
isolated stacking context and the performance dimmer; themes continue to style `.setcast` and
its descendants. Do not override `.sc-output` or `.sc-output-dimmer`. Brightness covers the
whole composition, including theme pseudo-elements. The stage exposes `--performance-intensity`
and `--performance-brightness`; audio hooks already include intensity, so do not multiply it
again. Renderers and plugins must retain labeled readiness holds for asynchronous work.

The stage carries `data-presentation="playlist|dj"`, `data-current-plays`, and optional
`data-section="drop|breakdown|buildup"`. `data-shared-drop="true"` means the current mix section
was established by a drop naming multiple participants. `data-background="none|image|video"`
names the art the background shows right now: the first focused play's, else the project's, and
`none` when neither exists. The stage has no global deck.

For an image, the stage also carries `--bg-luma`, the mean Rec. 709 luma (0..1) of the art as
the frame shows it, and `--bg-exposure`, the factor (0.1..4) that scales it to `REFERENCE_LUMA`
(0.09, the demo background most built-in themes are tuned against). A theme starts the art's
filter with a correction toward the brightness its treatment is designed for, either the
reference, `brightness(pow(var(--bg-exposure, 1), var(--bg-correction, 1)))`, or its own
`--art-luma`, `brightness(pow(clamp(0.1, var(--art-luma) / var(--bg-luma, var(--art-luma)), 4),
var(--bg-correction, 1)))`. The theme's default strength sits in the `--bg-correction` fallback,
so a user's `--bg-correction` (0 leaves the art as it is) overrides it.

`--bg-color-1` and `--bg-color-2` are the art's most prominent hues as `rgb()` colors, the second
at least 60° from the first; grey art has neither. A theme derives its colors in variables of its
own, keeping its lightness and chroma, such as `--bg-accent: oklch(from var(--bg-color-1) 0.7 0.19
h)`, and uses `var(--bg-accent, <its own color>)`. A missing hue then falls back, and a user can
set `--bg-accent: initial` to keep the theme's colors. Video backgrounds are not measured, so every
fallback applies.

`.sc-header`, `.sc-set-title`, `.sc-clock`, every `.sc-panel`, `.sc-next` and `.sc-tracklist`
carry `--bg-luma-behind`, the mean luma (0..1) of the art under the element's box. It is measured every
frame, so it follows a panel as it moves. Like `--bg-luma`, it describes the art before the
theme's filter; multiply it by the brightness the filter applies to estimate what the frame shows
behind the element. A custom property resolves `var()` where it is declared, so declare variables
derived from it on the measured elements themselves; their descendants inherit each element's
result. Use it for appearance, such as shadows, plate opacity or color, and not for size or
position: it is measured from the layout without it. It is unset for video and when there is no
art, so `var(--bg-luma-behind, 0)` treats both as dark. The measurement assumes the art is
centered the way `object-fit: cover` places it, so an `object-position` override or a large
transform on `.sc-bg-img` moves the art away from what was measured. sterile-tech keeps its header
and panels legible over bright art, in short like this:

```css
.theme-sterile-tech {
  --art-gain: pow(var(--bg-exposure, 1), var(--bg-correction, 0.2));
}
.theme-sterile-tech :is(.sc-set-title, .sc-clock, .sc-panel, .sc-next) {
  --glare: clamp(0, (var(--bg-luma-behind, 0) * var(--art-gain) - 0.2) * 4, 1);
  --busy: clamp(0, (var(--bg-detail-behind, 0) - 0.03) * 16, 1);
  --veil: max(var(--glare), var(--busy));
}
.theme-sterile-tech .sc-panel {
  background-color: color-mix(in srgb, var(--panel-bg), rgb(8 11 15) calc(var(--veil) * 62%));
}
```

An image's detail is measured too. `--bg-detail` is the mean absolute luma difference between
neighboring cells of a grid 64 cells along the frame's long side: about 0.005 for flat art such
as the demo's, 0.02 to 0.05 for a dark scene and 0.1 for busy art. The measured elements carry
`--bg-detail-behind`, the detail under their box, next to `--bg-luma-behind`; a dense pattern of
moderate brightness needs a plate behind text as much as a bright sky does. `--bg-focus-x` and
`--bg-focus-y` (0..1) are where the subject sits: the center of the cells busier than the mean,
or the middle of the frame for flat art. `data-bg-calm` names the candidate area for a block of
text with the least detail, and `--bg-calm-luma` and `--bg-calm-detail` are measured over it. In
a landscape frame the candidates are the corners (`top-left`, `top-right`, `bottom-left`,
`bottom-right`) and the middle of each edge (`top`, `left`, `right`, `bottom`), each about a third
of the frame; in portrait they are bands across the top and the bottom thirds (`top`, `bottom`).
`[data-bg-calm^='top']` selects the top row and `[data-bg-calm$='left']` the left column. Ties
go to `bottom-left`. Video and a stage without art carry none of these.

`backgroundFit` decides how art of another shape than the frame is shown: `cover` crops it,
`contain` shows it whole over a blurred, darker copy of itself, and `auto` (the default) contains
art that covering would cut by more than 30%. A contained image reaches `.sc-bg-img` as one image
the size of the frame, so theme rules apply to it unchanged. `.sc-art`, next to it in `.sc-bg`,
is the file itself at its own shape, for a theme that shows the art as an object, such as a print
on a wall. It is hidden until a theme shows it. `--bg-aspect` on the stage is the file's width
over its height, so `width: min(80cqw, 70cqh * var(--bg-aspect))` fits it in a box. Video has
neither. Visualizers that draw with the art itself (`fill: art`, `bloom`) follow the art the theme
shows: `.sc-art` when it is displayed, else `.sc-bg-img`.

Stage variables include `--current-plays`, `--set-progress`, `--section-time`,
`--since-drop`, `--until-drop`, `--since-breakdown`, `--until-breakdown`,
`--since-buildup`, `--until-buildup`, `--since-rewind`, `--until-rewind`,
`--drop-intensity`, and `--drop-participants`. Seconds cap at 60, including absent cues.
`--beat` and `--bar` remain optional tempo phases, not inferred hardware state.
`--travel-bass` and `--travel-high` are the running sum of each band's energy since the start of
the set, in seconds at full energy, so they grow by at most 1 a second and never decrease. Motion
driven by them speeds up with the music and stops in silence without jumping back. The stage sets
them only when the theme or project CSS contains `var(--travel-`, because computing them reads the
whole set before rendering.

Every `.sc-panel` has `data-play`, `data-focused`, `data-returning`, its own optional
`data-deck`, `data-section`, `data-tail`, and space-separated `data-tags`. Its cue variables are
local, including cues propagated by a shared drop. It also has `--since-entry` and `--until-exit`
from the uninterrupted run. Metadata changes between adjacent intervals do not reset them.
`--play-order` is the play's input position and never changes for a play, so themes can derive
stable per-play variety from it, such as a tilt of `calc(sin(var(--play-order)) * 2deg)`.
`--drop-flash`, `--rewind-flash`, and `--tension` are recomputed on panels, so mix-level
flashes are not accidentally inherited as local cues. With a tracklist, a panel also has
`data-listed`: `true` while the list shows a row for its play, `false` for a play without a
listing or one whose row has left the list's window.

`--show` springs in at run start, holds for `panel.dwell`, and fades over `panel.fade`.
`dwell: 0` keeps it present; `fade: 0` cuts at the dwell endpoint. Built-in themes consume
`--presence`, which follows `--show` in playlist mode. In DJ mode it springs in the same way,
holds for the whole run so current credits stay readable, and eases out over the run's last
0.6 seconds. With a tracklist, a DJ panel whose play has a row in the list announces its entrance
instead: once the dwell and fade are up, the row carries the credit and the panel closes, and it
opens again if the row leaves the list. A panel the list has fully taken over is not rendered and
takes no room in the stack, so `.sc-contributors` can be empty while plays contribute; a play
without a row keeps its panel for the run. `panel: { dwell: 0 }` keeps every panel up.
DJ emphasis still reflects focus and dwell. passe-partout's label and patina's caption
sit beside the art rather than over it, so they stay for the whole run in playlist mode too
(`--since-entry`, `--until-exit`), unless the tracklist lists their play. A shared drop does not
retrigger an entrance; themes can react to its local `--drop-flash` instead.

`panel: false` renders no panels at all. `.sc-contributors` stays, empty, so a layout anchored to
`--contributors` keeps its place; without a tracklist, nothing credits the plays.

Each panel sits in a `.sc-slot` that carries its `--presence`. In DJ mode base.css stacks the
slots in play order, anchored at the bottom of `.sc-contributors`, and sets each slot's height
to `--presence` times its panel's height. The stack opens as a panel rises into its slot and
closes as one sinks out of it, without a jump. Slots clip vertically at their own edges and
`--stack-gap` spaces them. Height and gap change in whole pixels: Chrome does not repaint the
text of a composited panel, such as one with a `backdrop-filter`, that layout moves by a fraction
of a pixel, so its text could stay a pixel off. A theme that moves composited elements through
layout itself should do the same. Keep shadows and ornaments above or below a panel inside its
padding: Chrome applies `overflow-clip-margin` only when both axes clip, so `--slot-bleed` does
not reach past the slot's vertical clip. A theme can rearrange the slots,
for example into a row that collapses their width instead. The DJ `.sc-contributors` is the
anchor `--contributors`, so a theme can keep `.sc-next` above the stack with
`position-anchor: --contributors; bottom: calc(anchor(top) + 2cqw)`.

`.sc-contributors` lays out current panels. Built-ins show up to four panels in landscape and
three in portrait, keeping focused plays visible first and preserving play order among the
visible subset. More contributors produce an explicit count, an overflow count and an
accessible list of every contributor. This is a presentation limit, not a domain limit.
Playlist mode selects the first focused play; all overlaps remain available to queries and
exports. A playlist counter explicitly says “Listing”. Unknown artists and decks are omitted.

`.sc-next` carries `--until-next` and one `.sc-next-artist` (when known) and `.sc-next-title`
pair per upcoming play. Its label is “Next in tracklist” in playlist mode;
DJ mode shows the next group of run entrances as “Next entry” or “Returning”. It does not
predict loaded decks. `Background` uses the first focused play's art, falling back to the
project art, with an immediate change when focus changes. It never invents a previous track.

Overview marks use `data-type="listing"` for editorial listings and the annotation kind for
cues. Shared drops are `data-type="drop"`, with their participants in the document.
Existing visualizer classes, media wrappers, font loading and master-audio contracts remain.

## Tracklist

`tracklist: true` in `setcast.yaml` shows the listings around the current one, two before and two
after; `tracklist: { before: 3, after: 1 }` sets the counts (whole numbers from 0 to 99) and
`false` turns it off. It is off by default. A theme can name default counts in `Theme.tracklist`,
written like the key; they apply when the project has no `tracklist:` key, and the project's
counts win key by key. `tracklistView(document, state, counts)` in `@setcast/core` computes the
rows for any moment, and `ResolvedProject.tracklist` holds the resolved counts or null.

```html
<section class="sc-tracklist" style="--since-listing: 5; --until-listing: 14">
  <p class="sc-tracklist-heading">Tracklist</p>
  <ol class="sc-tracklist-rows">
    <li class="sc-tracklist-row" data-play="t7" data-state="current" data-focused="true"
        data-returning="false" data-ahead="false" data-deck="A"
        style="--row-offset: 0; --row-presence: 1; --row-progress: 0.25; --since-entry: 5; --until-exit: 18">
      <span class="sc-tracklist-index">07</span>
      <span class="sc-tracklist-time">2:01</span>
      <span class="sc-tracklist-artist">Vex &amp; Morrow</span>
      <span class="sc-tracklist-title">Night Shift Dub</span>
      <span class="sc-tracklist-label">Ferrite Audio</span>
    </li>
  </ol>
</section>
```

Rows are listings, so unlisted contributions such as teases never appear in the list; the panel
credits them while they play. The window is anchored on the latest listing group at or before
the current time and holds that whole group plus the requested counts around it. A row's state
comes from contributions instead: `data-state="current"` while its play contributes, wherever the
row sits, so in DJ mode several rows can be current at once and a play that enters before its
listing is already current below the anchor. Otherwise a row is `played` once its listing time
has passed and its play has been heard, and `upcoming` before that. `data-ahead` is `true` while
the row's listing time is still to come, so `[data-state='current'][data-ahead='true']` is a play
heard before its listing: a tease or an early entrance. Unlike `--row-offset`, it tells the
second of two tied listings, or a row starting its glide, from the next listing. A current row carries its
contribution's `data-deck`, so `--deck` resolves on it as on a panel; `data-focused` and
`data-returning` follow focus and the current run.

The index is zero-padded to the digits of the listing count, and the time is the listing time on
the display clock, `clockOffset` included. `.sc-tracklist-artist` is omitted when the artist is
unknown. `.sc-tracklist-label` holds the recording's label and version, as the panel's
`.sc-label` does, and is omitted when the recording has neither; base.css hides it like the time,
so a theme shows it by setting `display`.

A current row also carries what its panel knows about the run: the contribution's `data-tail` and
`data-tags`, and the run's `--since-entry` and `--until-exit`. A theme can ease a row's highlight
in and out with them instead of switching it with `data-state`, or set apart a row that a tease
lights up early (`[data-tags~='tease']`). Mix cues such as `--drop-flash` reach rows from the
stage, as they reach the rest of the list.

When a new listing group starts, the list glides to it over 0.8 seconds. `--row-offset` is a
row's distance in rows from the first row of the current group, fractional during the glide.
`--row-presence` (0..1) is how far inside the window the row is: the row leaving at the top fades
from 1 to 0 while the one entering at the bottom fades in. base.css sets each row's height to
`calc-size(auto, size * var(--row-presence))` with `overflow: visible clip`, so the list scrolls
by one row without a jump. A row with a negative offset aligns its content to its bottom edge
(`align-content: if(style(--row-offset < 0): unsafe end; else: normal)`), so the leaving row
scrolls out of the top rather than losing its last line first; this works for block and grid rows.
A row cannot shrink below its padding and border, so scale those by `--row-presence`
(`padding-block: calc(0.6cqw * var(--row-presence))`) or space the row's children instead. Chrome
ignores `calc-size()` heights on flex items, so the rows' container must not be a flex container.
Keep a row's ornaments inside it for the same reason as a DJ slot's. A theme can instead place rows itself from `--row-offset`, for example
`translate: 0 calc(var(--row-offset) * 1.4lh)`, and fade them with
`opacity: calc(var(--row-presence) * (1 - abs(var(--row-offset)) * 0.2))`. `--row-progress` runs
0..1 through a row's listing span, from its time to the next listing group or the mix end.
In DJ mode an older row can still be current after its listing span has ended; its progress is 1.
`--since-listing` and `--until-listing` on the root count seconds since the current listing group
and until the next, capped at 60 like every other cue.

base.css places the list at the top right (`--tracklist-top`, `--tracklist-width`; the full width
in portrait) and gives it a plain look in `@layer fallback`, from `--font-mono`, `--fg`, `--fg-dim`
and `--deck`. Any theme rule wins over the layer, whatever its specificity, but properties the
theme leaves unset still apply: rows are `display: flex` with `column-gap`, `line-height: 1.6`,
`white-space: nowrap` and an opacity, and `.sc-tracklist-time` is `display: none`. Titles clip
with `overflow: clip` and `overflow-clip-margin: 0.3em` for their ellipsis; `overflow: hidden`
would also cut accents above capitals and text glows. `.sc-tracklist` carries `--bg-luma-behind`
and `--bg-detail-behind` like the panels. The tracklist replaces up next: with it, the stage does
not render `.sc-next`, so `after: 0` shows nothing ahead. It renders in up next's place, after
the panels, so it can use `position-anchor: --contributors` as `.sc-next` does. The DJ stack is
usually short next to a list, since listed plays leave their panels after the dwell, but a tease,
an unlisted loop and a new entrance can still stack up three panels; keep the list clear of them,
or let the oldest rows give way first, because the current rows matter most. With `panel: false`
the list is the only credit, and loading warns about plays without a listing, which it cannot
show.

## Scoped modulation

Routes accept `scope: mix` (default) or `scope: play`. Mix routes produce stage `--mod-*`
variables. Play routes evaluate separately for every current panel and override inherited
variables on that panel. Routes with the same scope and target use the last definition.

```yaml
modulation:
  - {source: since:drop, target: wash, window: 0.7}
  - {source: since:drop, scope: play, target: panel-glow, window: 2}
  - {source: bass, scope: play, target: pulse, when: drop}
```

For play routes, `since:<kind>`, `until:<kind>` and `when` use local annotations and sections
within the current run. Audio sources still read the master bus, including on a panel.
Tempo sources use the project's stated tempo. Kinds accepted as timeline sources are `drop`,
`breakdown`, `buildup`, `section_end`, `rewind`, `technique`, and `note`.

## Importers and inspection

An importer returns `ImportedPlay[]`: `{at: seconds, title, artist?, label?}`. These are
editorial timestamps, not measured entrance or exit boundaries. The CLI attaches an evidence
source identifying the imported file. Custom importer callers should likewise attach source
metadata before normalization. Importing does not assign decks or deduplicate matching titles.

`setcast inspect --json` exports the normalized document with every generated ID materialized.
`setcast inspect --at 1:23 --json` exports a query instead. Without `--json`, inspection
explains every boundary's mechanical origin: `authored`, `listing`, `next_listing`, or
`mix_end`. These origins are not confidence scores. `chapters: []` disables chapter output;
otherwise export preserves the compiled chapter timestamps and warns about YouTube constraints.

Namespaced custom annotations and extension payloads survive normalization and inspection.
Unknown core fields fail validation. Capture logs, source transport, hardware occupancy,
per-deck audio and live receipt-time replay remain deferred.
