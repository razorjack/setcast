# DJ mix model and authoring format

Status: offline implementation complete. Revised 9 October 2026.

Setcast models **recordings, plays, contributions, and annotations**, with a separate
editorial tracklist and presentation policy. Any number of plays can contribute at once. A
basic set needs only a timestamp and track metadata per row; richer descriptions add detail
locally. The audio remains one already mixed recording. This is a visualization and attribution
model, not instructions for producing or reconstructing that audio.

This design replaces the earlier proposal. Backward compatibility is explicitly out of scope:
there are no legacy event aliases, synthetic deck assignments, or compatibility reducers to
preserve. Project files, components, CLI output and built-in themes use this contract. The
renderer-independent `RenderFrame` principle remains.

[The evidence record](dj-mix-evidence.md) separates source observations, report critiques, and
engineering decisions. References such as **F01** and **D01** refer to that document. Original
research inputs are archived there. The examples below use accepted authoring syntax. Unless
identified otherwise, their names and timings are illustrative.

## 1. Concepts and boundaries

A **recording** identifies particular recorded material, including its version. An original,
remix, VIP, or released edit can be distinct recordings. Artist/title text is display metadata,
not identity. Two unidentified recordings are not merged because both say `ID`.

A **play** is one independently identifiable use of a recording in this performance. It may
appear briefly, disappear, and return. Two independently manipulated copies are two plays,
even when their recording and source position match. An author decides whether a later return
continues a play or starts another occurrence. Loading, unloading, changing decks, looping,
scratching, or jumping within a source does not automatically create a new play. **F01, F04; D01.**

A **contribution** is a half-open interval in mix time during which a play is credited as part
of the performance. This is an annotation of participation, not a sample-level claim about
sound, an exact fader measurement, or a promise that the full arrangement is present. Natural
rests do not require splitting intervals. An intentional removal followed by a return can be
represented by separate intervals. Uncredited audio is not necessarily silence. **F02, F05; D02.**

A **listing** is an editorial timestamp for navigating or publishing a tracklist. It may mark
an entrance, a takeover, or another useful point. It is not an observed acoustic boundary. A
basic listing supplies fallback participation until the next listing, clearly marked as an
assumption. Explicit contributions replace that fallback without moving the listing. **F07; D03.**

An **annotation** describes a musical moment or passage: drops, breakdowns, rewinds, bass swaps,
loops, or notes. It can refer to the mix or particular plays. An annotation never starts or ends
a contribution. **F01, F06; D04.**

A **deck** is an optional temporal association of a contribution. It is neither play identity
nor proof of audibility. A **focus directive** chooses editorial emphasis among contributing
plays. It is neither a mixer measurement nor a musical annotation. **F03; D05, D06.**

## 2. Authoring progressively in YAML

Use `plays:` for both simple and detailed sets. No separate DJ schema, event log, recording
catalog, deck map, BPM, IDs, or original track files are required for a basic set. Project
settings such as theme and visualizer remain outside this timeline contract.

### A basic set

```yaml
audio: assets/mix.wav
plays:
  - {at: 0:00, artist: First Artist, title: First Track}
  - {at: 3:20, artist: Second Artist, title: Second Track}
```

`at` creates a listing. With no richer timing, it also starts fallback participation. The first
play is credited over `[0:00, 3:20)` and the second over `[3:20, audio end)`. This is a useful
presentation assumption for sparse data, not a claim that the actual mix contains no overlap.

### A blend adds one field

```yaml
audio: assets/mix.wav
presentation: {mode: dj}
plays:
  - {at: 0:00, until: 3:45, artist: First Artist, title: First Track}
  - {at: 3:20, artist: Second Artist, title: Second Track}
```

Both plays contribute from 3:20 through 3:45. `until` overrides the inferred end of that row;
`until: end` explicitly keeps it through the end of the mix, regardless of later listings.
The start still comes from the listing, so its origin remains distinguishable from a fully
annotated interval.

### Refine participation without moving the tracklist

```yaml
audio: assets/mix.wav
plays:
  - {at: 0:00, until: 3:45, artist: First Artist, title: First Track}
  - at: 3:20
    artist: Second Artist
    title: Second Track
    contributions:
      - {from: 2:50, until: end}
```

The second play actually enters the authored timeline at 2:50; its listing stays at 3:20.
`contributions` replaces that row's entire fallback interval. It can coexist with `at`, but
not with row-level `until`. There is one participation authority per row, with no merging of
fallback and explicit intervals.

### Teases, a return, and a shared drop

```yaml
audio: assets/mix.wav
presentation: {mode: dj}
plays:
  - id: foundation
    at: 0:00
    until: 4:20
    artist: First Artist
    title: Foundation
  - id: visitor
    at: 2:00
    artist: Second Artist
    title: Visitor
    contributions:
      - {from: 1:00, until: 1:08, tags: [tease]}
      - {from: 1:24, until: 1:32, tags: [tease]}
      - {from: 2:00, until: 5:00}
annotations:
  - {at: 2:20, kind: drop, participants: [foundation, visitor]}
  - at: 2:00
    until: 4:20
    kind: technique
    participants: [foundation, visitor]
    tags: [blend]
focus:
  - {at: 0:00, plays: [foundation]}
  - {at: 2:00, plays: []}
```

Visitor receives its own panel during both teases, while Foundation retains editorial emphasis.
The focus reset at 2:00 restores automatic emphasis. At 2:20 both plays receive the shared drop
cue. Removing the cue or `blend` annotation does not remove the overlap. Removing a `tease` tag
does not change focus, participation, or chapters.

An overlay that needs no tracklist entry simply omits `at` and supplies contributions. Its
addition cannot shorten an existing fallback play: only actual listings delimit fallback ends.
For example, inserting a contribution-only tease at 1:00 between listings at 0:00 and 3:00
leaves the first fallback interval at `[0:00, 3:00)`. **D03, D06; G01.**

### Reuse a recording only when needed

```yaml
audio: assets/mix.wav
recordings:
  break-record: {artist: Example Artist, title: Example Break}
plays:
  - id: left-copy
    recording: break-record
    at: 0:00
    contributions:
      - {from: 0:00, until: 1:30, deck: A}
  - id: right-copy
    recording: break-record
    contributions:
      - {from: 0:30, until: 1:00, deck: B}
```

`recording` references the optional metadata dictionary and excludes inline `artist`, `title`,
`label`, and `version`. Anonymous inline metadata creates a separate recording per play; text
matching never deduplicates it. The dictionary does not require an audio asset for that recording.
`title` is required; other metadata is optional. `title: ID` is an ordinary placeholder, not a
reserved identity. Unknown artist is an omitted artist, not an invented value.

A play's `id` is needed only when another field refers to it. Normalization gives every entity
an ID. Explicit IDs are stable; generated IDs are deterministic within one input revision, not
across arbitrary insertions. Exporting editable normalized data materializes all IDs.

### Deck reuse and a tail

```yaml
audio: assets/mix.wav
plays:
  - id: outgoing
    title: Outgoing
    at: 0:00
    contributions:
      - {from: 0:00, until: 1:00, deck: A}
      - {from: 1:00, until: 1:10, deck: A, tail: true}
  - id: incoming
    title: Incoming
    at: 1:02
    contributions:
      - {from: 1:02, until: end, deck: A}
```

The outgoing play has one uninterrupted contribution run ending at 1:10. Its tail's deck is an
origin association, not a claim that it still occupies that player. The new play can also be
associated with A. The model does not enforce one contributing play per deck. A deck transfer
uses adjacent intervals with different deck values, also without creating a new play or run.

Omitted `deck` means unknown. Deck IDs are arbitrary nonempty strings, not an A/B or A-D enum.
Omitted `tail` means the mechanism is unspecified; `tail: true` positively asserts tail-only
participation. There is no default assertion of direct routing. An optional `parts: [vocals]`
describes credited components without claiming separate audio stems are available. Omitted
`parts` means unspecified. **F03–F05, F10; D05.**

## 3. Exact input and time rules

The accepted play timing forms are:

1. `at`, optionally with `until`, and no `contributions`.
2. Nonempty `contributions`, optionally with `at`, and no row-level `until`.

Every contribution requires `from` and `until`. There is deliberately no second shorthand such
as `start`, no implicit end inside an explicit contribution list, and no independently authored
`mix_in`/`mix_out` stream alongside the intervals. **D07.**

Time values are nonnegative seconds or strings `M:SS`, `M:SS.fraction`, or `H:MM:SS.fraction`.
Seconds components, and minutes in the three-component form, must be below 60. YAML 1.2 parsing
is required; timestamps are not YAML 1.1 sexagesimal numbers. Numeric scientific notation is
accepted only if it resolves to a finite nonnegative value. Normalize time to integer
microseconds, rounded once to the nearest microsecond, halfway upward. Validate durations and
conflicts after normalization. This makes equality and tie handling explicit without tying
annotations to a video frame rate. Values smaller than that precision may collapse and fail
positive-duration validation. **D08.**

All author times are relative to the supplied mix audio. `until: end` resolves to its probed
duration, rounded by the same rule. It never means the duration of a source recording. A display
clock offset does not change timeline coordinates. A render slice queries the original timeline
at `sliceStart + frame/fps`; it does not restart contributions, focus, or annotation history.

Mix duration must be positive. Intervals are `[from, until)`, with
`0 <= from < until <= duration`. Listing and moment times
must be in `[0, duration)`. An interval can end at duration; an annotation moment cannot begin
there. Gaps, unlimited concurrent plays, and a first listing after zero are valid. Before the
first contribution the credited set is empty. Do not fabricate a track to fill it.

Within one play, contribution intervals must be ordered and nonoverlapping. Adjacent intervals
are permitted for metadata changes. Their maximal contiguous union is a **contribution run**.
Changing deck, tags, parts, or tail status at an adjacent boundary does not retrigger entrance,
reset local section state, or refresh panel dwell. A positive gap starts a new run. Separate
simultaneous contributions of the same recording require separate plays. **D02, D08; G02, G05.**

Listings are sorted by time. For a fallback row, the next *strictly later listing time* closes
it; absent another listing, mix duration closes it. Multiple listings at one timestamp form one
group: their fallback plays all start together and end at the next distinct listing time.
No zero-length fallback intervals or hidden last-row-wins rules are created. This intentional
group is credited together, but it does not assert a synchronized musical drop. Explicit ends
can precede or follow the next listing.

Input order provides stable order among tied entities, never silent conflict resolution.
Adding a listing can change adjacent fallback ends, by definition. Adding or editing explicit
contributions cannot change another row's fallback unless its listing also changes. `at` can
fall outside its play's contributions because it is editorial; warn when it lies in no
contribution, but preserve it. A play without `at` has no inferred listing or chapter.

## 4. Musical annotations

Common moments need little syntax:

```yaml
audio: assets/mix.wav
recordings:
  first: {title: First Track}
  second: {title: Second Track}
plays:
  - id: left-copy
    recording: first
    at: 0:00
    contributions:
      - {from: 0:00, until: 1:00}
      - {from: 1:08, until: 3:00}
  - id: right-copy
    recording: second
    at: 0:40
    contributions:
      - {from: 0:40, until: 1:00}
      - {from: 1:08, until: 3:00}
annotations:
  - {at: 0:48, kind: drop, participants: [left-copy, right-copy]}
  - {at: 1:00, kind: rewind, participants: [left-copy, right-copy]}
  - {at: 1:08, kind: drop, participants: [left-copy, right-copy]}
  - {at: 1:20, kind: breakdown, scope: {plays: [right-copy]}}
```

Here the rewind occurs at the end of both plays' runs, with new runs beginning at 1:08. The
rewind marker itself neither removes them nor moves a source head. The contribution intervals
express their withdrawal and return.

`scope` defaults to `mix`. A local scope is `{plays: [id, ...]}` with a nonempty distinct list.
`participants` is an optional, nonempty distinct list on mix-scoped annotations; it is forbidden
with a local scope. This separates a mix-level cue with named participants from a cue that
changes only particular plays.

Built-in moment kinds are `drop`, `breakdown`, `buildup`, `section_end`, and `rewind`.
`drop` may carry `intensity` in `[0, 1]`, defaulting to 1. `technique` and `note` may be moments
or spans with `until`; a note requires text, and a technique requires at least one tag.
An explicit span must have positive duration. Section kinds and rewind are moments only.

`drop`, `breakdown`, and `buildup` establish persistent section state at their scope;
`section_end` clears it. A mix section lasts until another mix section change or mix end.
A play section lasts until another local section change or the end of its current run.
It begins unknown on every new run. A mix section does not automatically become every play's
section.

A mix-scoped `drop` with participants establishes the mix drop and a local drop for each named
play. This is the one built-in propagation rule. Two participants express a double drop;
three or more express a multiple drop. No separate `double_drop` state or automatic participant
inference is needed. A drop without participants changes only the mix section. Simultaneous
local drops are not automatically promoted to a mix cue.

Other mix-scoped annotations do not propagate section state to their participants. A mix
breakdown can coexist with a local drop; a mix drop without participants can coexist with one
play's breakdown. Two writes to the same section at the same instant are an error, including
writes expanded from a shared drop, even if their values agree. Combine or remove the duplicate
annotation. File order must not conceal a contradictory interpretation.

Local section changes and the participants of a shared drop must be contributing immediately
after interval boundaries at that time. A targeted rewind permits contribution immediately
before or after the moment, so a pull-up can end exactly there. Other notes and techniques
require valid references, but do not require uninterrupted participation throughout their span.
A technique can cover a sequence of intermittent teases.

All annotations can carry descriptive tags. Suggested vocabulary includes `blend`, `tease`,
`bass-swap`, `cut`, `loop`, `scratch`, and `echo-out`. These are a catalog of labels, not a closed
transition state machine. Multiple labels and overlapping spans are valid. Tags have no effect
on membership, focus, sections, or chapter generation. A theme may style them. **D04; F06, F09.**

Custom annotation kinds must be namespaced, for example `my-plugin:camera-cue`, with JSON data
under `data`. Unknown namespaced annotations are preserved and do not change built-in state.
Unknown unnamespaced kinds fail validation to catch misspelled built-ins. Plugins may validate
their own payloads and render them; changing participation still requires explicit contributions.

## 5. Presentation, navigation, and focus

`presentation.mode` is `auto` by default, with explicit `playlist` and `dj` choices. `auto`
selects DJ presentation for the entire project if normalized contributions overlap anywhere;
otherwise it selects playlist presentation. The mode does not change halfway through a set.
Choosing `dj` explicitly is useful even without annotated overlaps. **D06.**

Playlist presentation emphasizes one focused play and the next listing. DJ presentation shows
all current plays, with focus controlling relative emphasis. Two current plays receive two
panels, including at a shared drop; three receive three, subject to a responsive overflow
layout. Capacity is a layout issue, not a data limit. If panels must be condensed, retain an
explicit count and an accessible list of all contributors. Known deck labels can be displayed;
unknown decks do not acquire synthetic A/B labels.

The model always exposes all current plays. Playlist mode deliberately chooses a single-panel
view; it must not erase overlaps from exports, queries, or annotations. In DJ mode use “next
entry” or “returning” for predicted contribution runs, and “next in tracklist” for listings.
A loaded deck is not an upcoming contribution. No next-deck or next-track prediction is inferred
from missing hardware information.

Automatic focus chooses the most recently started current contribution run whose current
interval is not explicitly tail-only. If only tails remain, choose among them. Ties choose the
first play in original input order. A tag such as `tease` never changes this rule. Automatic
focus can therefore shift
to a tease; use a focus directive to keep a foundation emphasized, as in the example above.
This is an editorial default, not a loudness or dominance estimate.

A focus directive `{at, plays: [...]}` replaces any previous pin with the listed order. All
listed plays must be contributing after boundaries at `at`; the list must be distinct. A pin
expires for each selected play at the end of that play's current run. A returning play does
not rejoin the old pin. When no selected plays remain, automatic focus resumes. `{plays: []}`
restores automatic focus immediately. Two directives at the same time are invalid. Metadata
changes within a run do not expire pins; an explicit pin can continue into a tail.

For example, pin A and B at 10. If A leaves at 20 and returns at 25, only B remains pinned.
If B leaves at 30, automatic focus resumes and may choose A. This behavior is derived from the
selected run IDs, so querying frame 30 directly gives the same result as playback through it.

A listing never switches focus directly. A contribution entrance does not create a listing.
These independent controls let the chapter remain at a full entrance while an earlier tease
still receives credit. `chapters` omitted generates one chapter per listing-time group, joining
that group's titles in input order. Explicit `chapters: [{at, title}, ...]` replaces the entire
generated list; `chapters: []` disables chapters. Custom chapter times must be unique. Platform
requirements such as minimum chapter lengths belong to the export command, not the mix model.

Expose explicit counts: `recordingCount`, `playCount`, `listingCount`, and `currentPlayCount`.
There is no universal DJ “track 7 of 20” index: duplicated recordings, unlisted teases, and
returns make that ambiguous. A playlist view may show a listing index with that label.

## 6. Normalized model and ownership

The canonical domain document stores finite contribution intervals, listings, annotations, and
focus directives. The authoring YAML is its ergonomic input. Compile a boundary index for
fast timeline queries; do not make generated boundary events a second editable authority.
An event-driven renderer can consume that index without requiring authors to balance pairs
of start/stop events. **D07.**

The following TypeScript defines the central shape. `Annotation` is a validated discriminated
union implementing section 4; it is not an unrestricted bag of optional fields. All references
resolve within the same document. Media paths and theme settings remain in the outer project.

```ts
type Id = string;
type Time = number; // Safe integer microseconds in normalized documents.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Extensions = Record<string, Json>; // Namespaced keys only.

type EvidenceSource = { title: string; url?: string; note?: string };
type Origin = {
  kind: 'authored' | 'listing' | 'next_listing' | 'mix_end';
  path: string;
};
type Recording = {
  id: Id;
  title: string;
  artist?: string;
  label?: string;
  version?: string;
  evidence?: Id[];
  extensions?: Extensions;
};
type Play = {
  id: Id;
  recording: Id;
  order: number;
  background?: string;
  extensions?: Extensions;
};
type Contribution = {
  id: Id;
  play: Id;
  from: Time;
  until: Time;
  origins: { from: Origin; until: Origin };
  deck?: Id;
  tail?: true;
  parts?: string[];
  tags?: string[];
  evidence?: Id[];
  extensions?: Extensions;
};
type Listing = { id: Id; at: Time; play: Id; order: number };
type FocusDirective = { id: Id; at: Time; plays: Id[] };
type Chapter = { at: Time; title: string };
type Stamp = { id: Id; at: Time; order: number; evidence?: Id[]; extensions?: Extensions };
type Scope = 'mix' | { plays: Id[] };
type Annotation = Stamp & (
  | { kind: 'drop'; scope: Scope; participants?: Id[]; intensity: number; tags?: string[] }
  | { kind: 'breakdown' | 'buildup' | 'section_end' | 'rewind'; scope: Scope;
      participants?: Id[]; tags?: string[] }
  | { kind: 'technique'; scope: Scope; participants?: Id[]; until?: Time; tags: string[] }
  | { kind: 'note'; scope: Scope; participants?: Id[]; until?: Time; text: string; tags?: string[] }
  | { kind: `${string}:${string}`; scope: Scope; participants?: Id[]; until?: Time;
      data: Json; tags?: string[] }
);
type MixDocument = {
  version: 1;
  duration: Time;
  recordings: Recording[];
  plays: Play[];
  contributions: Contribution[];
  listings: Listing[];
  annotations: Annotation[];
  focus: FocusDirective[];
  chapters: Chapter[];
  sources: Record<Id, EvidenceSource>;
  extensions?: Extensions;
};
```

Schema validation enforces the cross-field constraints that TypeScript does not express here,
including `participants` forbidden with a local scope. Normalization supplies empty lists,
`scope: mix`, intensity defaults, and compiled chapters. The input `version` may be omitted
and means 1; normalized documents always declare it. Unsupported versions fail explicitly.
Changing the contract later requires a deliberate version decision, not compatibility with
Setcast's current unreleased track format.

The normalized document is serialized JSON, without Maps, Sets, functions, Infinity, `end`,
or open intervals. All numbers must be finite; times additionally must be safe integers.
IDs are unique per entity kind and references are typed by their field. Generated identifiers
use a reserved `$` prefix; authored identifiers may not start with it. Source keys and deck
labels are strings; deck labels need not refer to a registry. `extensions` preserves opaque
JSON under namespaced keys on the document, recordings, plays, contributions, and annotations.
Unknown core keys fail validation. Extensibility should not hide typos.

Optional `sources` in authoring YAML records evidence titles, URLs, and notes. Recording metadata,
contributions, and annotations can cite those keys through `evidence`. Evidence on an inline
recording belongs to its metadata, not implicitly to its derived timing. `evidence` never affects
rendering. Boundary `origins` are generated mechanically: explicit contribution times are
`authored`, shorthand starts are `listing`, inferred ends are `next_listing` or `mix_end`.
An explicit numeric end is `authored`; an `end` sentinel is `mix_end`. These labels describe
how a value was obtained, not its accuracy or independent verification. Importers preserve their
source in evidence and must not relabel imported estimates as measured boundaries.

### Deterministic projection

`Timeline.at(timeSeconds)` converts query time by the same microsecond rule and returns:

- `currentPlays`: one entry per contributing play in original play order, including recording
  metadata, current contribution, run ID/start/end, optional deck, and local section/start.
- `focusPlays`: an ordered subset of current plays, determined by the policy above.
- `mixSection`: kind/start or null, plus explicit last/next annotation queries by scope and kind.
- `activeAnnotations`: spans satisfying `at <= t < until`; moments are queried through last/next,
  not presented as persistent active spans.
- `nextEntries`: the next group of contribution runs starting strictly after the query time,
  including returns; `nextListings`: the next listing-time group strictly after the query time.
- Listings and the separate counts defined above.

Before zero and at or after duration, reject queries rather than silently clamping. Renderers
query only valid frame times. Persistent section state is derived only from annotations at or
before the query. Last includes moments exactly at the query time; next is strictly later.
Group simultaneous moments instead of hiding all but one. A helper requiring a single result
uses stable annotation order and documents that choice.

At a shared boundary, membership uses the intervals after the boundary, then section changes
and focus directives apply. Run ends clear local sections and retire pins. Adjacent interval
changes within the same run do neither. Implement by an indexed query or ordered reducer with
checkpoints; both must have the same result for random access, forward playback, and reverse
scrubbing. Cache keys include the document revision. A generated boundary index is disposable.

Per-play panel entrances and dwell use run start, not contribution-segment start. Shared drop
cues expose all participants to the renderer. Per-play sections belong on their panels; the
mix section belongs on the stage. A singular global deck or global current track cannot stand
in for this state. Audio features remain master-bus features; do not display per-deck meters
or waveforms without actual per-deck audio or measurements.

## 7. Validation and acceptance cases

Reject invalid references, duplicate explicit IDs in a namespace, empty interval lists,
nonpositive or out-of-range intervals, overlapping intervals within a play, conflicting timing
forms, invalid annotation scopes, conflicting section writes, and invalid focus directives.
Check before rendering. Error messages name the YAML path, offending value, violated rule,
and a repair, such as: `plays[2].until conflicts with contributions; put the end on each
contribution and remove the row-level until`.

Warn about a listing outside its contribution intervals; never enforce hardware occupancy
through contribution data. Missing decks, unknown metadata, gaps, sparse fallback timing,
or an unlisted overlay are valid input,
not warning-worthy mistakes. Explain fallback origins in inspection output.

These semantic fixtures are covered by the implementation tests:

1. **Basic and cut:** listings at 0 and 200 yield `[0,200)` and `[200,D)`. At 200 only the second
   is current. First listing after zero yields no earlier credited play.
2. **Blend:** first until 225, second listing 200; both current at 210. Adding explicit second
   contribution from 170 preserves its listing at 200.
3. **Overlay locality:** add an unlisted `[60,68)` tease to listings 0 and 180. Foundation still
   contributes at 70 and 179. Removing the tease changes no other interval.
4. **Repeated tease:** Foundation `[0,260)`; Visitor `[60,68)`, `[84,92)`, `[120,300)`.
   Current sets at 64/72/88/100/140/270 contain 2/1/2/1/2/1 plays. Tags do not affect counts.
5. **Reload together:** A `[0,60)`, `[68,180)`; B `[40,60)`, `[68,180)`; shared drops at 48 and
   68, rewind at 60. At 60 neither is current; rewind validation succeeds against prior
   membership. At 68 both are current with new runs and local drops.
6. **Copies:** two plays referencing one recording overlap. `recordingCount=1`, `playCount=2`.
   Stopping one has no effect on the other. Do not assume their source positions match.
7. **Tail and transfer:** adjacent intervals split at 60, ending 70, remain one run. A new play
   on the same deck from 62 is allowed. Default focus favors the new non-tail play. Splitting
   at a metadata boundary does not restart panel dwell or clear a section.
8. **Three or more plays:** arbitrary concurrent contributions and shared drops have no two-deck
   or four-deck ceiling. This is a cardinality fixture, not a transcription of a cited set.
9. **Tied listings:** two rows at zero end at the next distinct listing, both current. A supplied
   `[0,0)` interval still fails. Tied local section writes fail instead of last-row-wins.
10. **Scope:** global drop without participants and B-local breakdown at 50 are valid. A shared
    drop naming B and B-local breakdown at 50 conflict. No new run inherits the previous run's
    local section.
11. **Focus retirement:** pin A/B, A ends at 20 and returns at 25, B ends at 30. Pin is B at 25;
    at 30 automatic selection resumes. Direct querying must match sequential evaluation.
12. **Editorial independence:** changing a tag, mode, deck, parts, or source note never changes
    contribution membership or listings. Changing explicit contributions never silently moves
    chapters. Explicit empty chapters disable chapter output.
13. **Known local demo:** the documented Stakka & Skynet excerpt normalizes to `[0,91)`,
    `[14,244)`, and `[200,331)`, yielding overlaps of 77 and 44 seconds. See **F11** for the
    limits of this existing annotation. Do not present those timings as new measurements.

Use property tests where they add coverage: segmentation neutrality for adjacent equivalent
intervals, event-index versus interval-query equivalence, input-order-independent membership,
and mode-independent normalization. Test authored errors and boundary times, not JSX layout.

## 8. Implementation scope and future live data

The finite offline implementation includes schemas and normalization, indexed projection,
importer and chapter behavior, multi-play components, scoped modulation, CSS contracts, and demo
fixtures. It replaces singular track/deck state without a migration compatibility layer.
[Theme and plugin contracts](theme-plugin-contract.md) document the public API, time units,
CSS attributes, per-run dwell and responsive overflow behavior. `setcast inspect` explains
boundary origins and exports normalized JSON with materialized IDs.

`vp run ready` validates formatting, lint, types, tests, renderer independence and the smoke
render. `vp run mix-stills` reproduces the inspected landscape and portrait examples of teases,
overlaps, shared drops and overflow. `vp run theme-stills --at 0:33.3 --at 1:18` checks the
built-in themes. The Knowledge excerpt fixture under `examples/demo/fixtures/` retains its
inherited-annotation qualification; the runnable demo uses synthetic audio and illustrative
credits. The original research archive is unchanged.

Keep capture and audio reconstruction outside this first implementation. Hardware transport,
loaded/cued state, fader/EQ telemetry, per-deck waveforms, source positions, tempo maps, and
sample-accurate routing are separate future information. The current model can label loops,
scratches, stems, and tails without pretending to reconstruct them. A pre-recorded mashup can
be one recording; separately performed layers can be separate plays. Live instruments and
microphones need a future source type, not fabricated recording metadata. **D09.**

A future capture log should distinguish observation time, effective performance time, revisions,
and unknown capture coverage. It should compile into a reconciled finite document for offline
rendering. An open interval cannot simultaneously mean “still contributing,” “capture stopped,”
and “we do not know.” Do not accept `until: null` in finalized offline input, or automatically
claim participation to EOF after hardware disconnection. The adapter or author must resolve it.

The reproducibility promise is: the same finalized document revision, assets, audio analysis,
renderer version, and render settings produce the same frame at the same time. Reproducing the
exact historical live display also requires what was known at each wall-clock instant, including
late corrections and absent future knowledge. A corrected performance timeline alone cannot
supply that. The renderer can remain event-driven without promising this stronger replay today.
**D07, D09; G07.**
