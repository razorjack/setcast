# DJ mix data model proposal

Status: proposed, not implemented. Research and repository review: 9 October 2026.

Setcast should describe which recordings contribute to a set over time, including overlaps,
teases, returns, and reloads. Keep timestamped tracklists as the simplest input. Add explicit
ends for ordinary blends, multiple intervals for interrupted contributions, and optional
musical annotations for drops and transition techniques. Compile these forms into one event
timeline shared by offline rendering and future live adapters.

The central distinction is between a **recording**, a **play of that recording**, and an
**interval when that play contributes to the mix**. A deck is an optional association, not the
identity of a track or evidence that the audience can hear it.

## Evidence and its consequences

These are artist accounts, equipment documentation, and published research. The design choices
following them are Setcast's proposed interpretation. The examples with invented track names
and timestamps below are illustrative, not transcriptions of those performances.

### Drum and bass and jungle

- **Andy C's XOYO residency, 2017.** He describes double dropping *The Pulse* and *The Beginning*,
  leaving a Calibre track running for six minutes while teasing *Circles* in and out, and
  pulling up whole mixes. A track need not replace the current track, a tease need not lead to
  a full play, and a reload can involve multiple tracks.
  [Andy C interview, UKF](https://ukf.com/read/andy-c-2017-so-far/).
- **Andy C's All Night performances.** His account distinguishes tracks rolling through,
  repeated teases that never fully drop, and simultaneous drops across three or four decks.
  A compulsory incoming-to-outgoing transition chain would lose those distinctions.
  [Andy C interview, UKF](https://ukf.com/read/andy-c-new-year-new-era/).
- **Calyx & TeeBee's FABRICLIVE 76 and live setup.** Their interview distinguishes a mix recorded
  on three CDJs from their six-deck live setup, with a mixer for each DJ feeding a central mixer.
  They also describe independently cueing the same track before either brings it into the mix.
  Deck count must not be fixed at two or four; cueing and contribution are separate facts.
  [Calyx & TeeBee interview, Kmag](https://kmag.co.uk/calyx-teebee-interview/).
- **DJ Storm's old-school sets.** She describes moving between eras and allowing for rewinds
  when changing speed. Set time must remain independent of source position and tempo.
  [DJ Storm lecture, Red Bull Music Academy](https://www.redbullmusicacademy.com/lectures/dj-storm-lecture/).
- **Published drum and bass mixing research.** A 2018 automated-DJ paper implements double-drop,
  rolling, and relaxed transitions with different structural alignments. Its chosen bar counts
  and transition restrictions are rules of that generator, not universal rules for human DJs.
  Setcast can annotate those techniques without imposing those restrictions.
  [From raw audio to a seamless mix](https://link.springer.com/article/10.1186/s13636-018-0134-8).

### Other genres and performance techniques

- **Jeff Mills and three-deck mixing.** Mills describes using the third turntable to keep music
  continuously mixed and fit more music into a shorter period. Concurrent contributions are
  useful beyond drum and bass, without requiring a drop at every change.
  [Jeff Mills interview, Ransom Note](https://www.theransomnote.com/music/interviews/jeff-mills-talks/).
- **Fades, cuts, phrase mixing, bass swaps, and filters.** Native Instruments' guide distinguishes
  these techniques. In a bass swap both tracks can remain present while their low-frequency
  contributions change. A bass swap is therefore not a track exit.
  [Five basic DJ transitions](https://blog.native-instruments.com/dj-transitions/).
- **Beat juggling and instant doubles.** Serato documents loading the same recording on two
  decks at the same source position and manipulating the copies independently. Recording
  identity cannot also be play identity.
  [How instant doubles work](https://support.serato.com/hc/en-us/articles/202538250-How-does-instant-doubles-work).
- **Stem mixing.** Serato supports independent vocals, bass, melody, and drums. Crediting a
  recording must not imply its entire original arrangement is present.
  [Serato Stems overview](https://support.serato.com/hc/en-us/articles/5700968326927-Stems-Overview).

### What timestamps can establish

A study of 1,557 matched mixes distinguishes transition boundaries from the single timestamp
in a tracklist. Its dataset mainly covers house and trance. This supports keeping a chapter
timestamp separate from overlap boundaries; it does not establish typical jungle transition
lengths. [A computational analysis of real-world DJ mixes](https://arxiv.org/html/2008.10267v1).

Raveform stores mix time and source-track time separately, alongside alignment and structural
annotations. Setcast should preserve that distinction when it eventually records source
positions. [Raveform dataset documentation](https://mir-aidj.github.io/raveform/).

A stereo recording and a timestamped tracklist do not establish deck assignment, fader values,
or precise audible boundaries. Preserve unknowns and the origin of timing information. Do not
turn a default into an observation.

## A progressive authoring format

All examples in this proposal use proposed syntax. Existing Setcast rejects the new fields.
All timestamps refer to the supplied mix audio, not the original individual tracks.

### An ordinary tracklist remains unchanged

```yaml
audio: assets/mix.wav
tracks:
  - {time: 0:00, artist: First Artist, title: First Track}
  - {time: 3:20, artist: Second Artist, title: Second Track}
```

With no explicit ends, the next entry closes the preceding entry; the last lasts until the
recording ends. This is the existing sequential presentation assumption. It is not a claim
that the source was mixed without overlap. Existing deck rotation and rendering remain
unchanged for legacy input.

### An ordinary blend needs an end time

```yaml
audio: assets/mix.wav
mode: dj
tracks:
  - time: 0:00
    end: 3:45
    artist: First Artist
    title: First Track
  - time: 3:20
    artist: Second Artist
    title: Second Track
```

Both tracks contribute from 3:20 to 3:45. No IDs, deck assignments, library, transition labels,
BPM, or original track files are required. `mode: dj` chooses the presentation preset described
below. The explicit overlap exists regardless of presentation mode.

### Teases and returns use multiple intervals

Use `audible` instead of `time` and `end` when one play comes in and out. The field names describe
the listener-facing mix, not whether the deck motor or playback transport is running.

```yaml
audio: assets/mix.wav
mode: dj
tracks:
  - id: foundation
    time: 0:00
    end: 4:20
    artist: First Artist
    title: Foundation
    deck: A
  - id: visitor
    artist: Second Artist
    title: Visitor
    deck: B
    audible:
      - {from: 1:00, to: 1:08, tags: [tease]}
      - {from: 1:24, to: 1:32, tags: [tease]}
      - {from: 2:00, to: 5:00}

events:
  - {time: 2:20, type: double_drop, plays: [foundation, visitor]}
  - time: 2:00
    end: 4:20
    type: passage
    plays: [foundation, visitor]
    tags: [blend]
```

At 1:04 both recordings are credited, with Visitor marked as a tease. At 1:12 only Foundation
is in the mix. At 2:20 both are credited and the double-drop cue can animate both panels. At
4:20 only Visitor remains. The passage describes the blend; deleting it does not remove the
overlap. Deleting the double-drop marker does not remove either track.

An interval means the play remains part of the mix through its own rests, breakdowns, and
low-volume passages. It is not a sample-by-sample sound detector. An explicit mix-out, such as
closing the channel before a later tease, ends the interval.

### Reuse metadata only when it helps

Each `tracks` row is a play occurrence. `id` names that occurrence. An optional `library`
avoids duplicating metadata when the same recording is played again or on two decks:

```yaml
audio: assets/mix.wav
mode: dj
library:
  break-record:
    artist: Example Artist
    title: Example Break

tracks:
  - {id: left-copy, track: break-record, deck: A, time: 0:00, end: 0:45}
  - {id: right-copy, track: break-record, deck: B, time: 0:12, end: 0:45}
```

`track` references library metadata and is mutually exclusive with inline artist/title/label
metadata. Per-play background overrides remain allowed. A recording is a particular version:
an original, VIP, remix, and edit are separate entries. Matching artist/title strings never
silently merges identities. Unknown recordings can still be written as `artist: ID, title: ID`.

This library is a YAML convenience, not a requirement to build a music database or provide
individual audio files. `audio` remains the already mixed recording.

## Precise input semantics

1. Each row uses exactly one timing form: `time` with optional `end`, or nonempty `audible`.
2. `time` without `end` retains sequential shorthand: end at the next row's first entry time,
   after chronological sorting, or recording end. In richer projects, adding a tease row may
   change that inferred end. Warn when a sequential boundary closes a play at a tagged tease;
   recommend an explicit end. Never silently infer a musical overlap.
3. `end: end` explicitly means recording end, even when later rows exist. Each `audible`
   interval requires `from` and `to`; `to: end` has the same recording-end meaning.
4. Numeric intervals are half-open: `[from, to)`. Endpoints stay in seconds, including fractional
   seconds. At an exact handoff time the outgoing interval is absent and the incoming one is
   present. Explicit simultaneous starts are allowed. Inferred zero-length entries retain
   legacy ordering for old projects and produce a warning; new annotations require positive
   durations.
5. Intervals within one play must be ordered and must not overlap. Adjacent intervals are allowed
   when contribution details change. Re-entry continues the same occurrence if it is still the
   same use of the recording; unloading and loading it again creates a new occurrence. When
   physical loading history is unknown, this is the annotator's grouping decision, not an
   inferred hardware fact.
6. `tags` describe an interval, for example `tease` or `loop`. Optional `parts: [vocals]` describes
   which components of the recording are contributing. Omitted `parts` means unspecified,
   not a claim that all stems are active. These fields do not alter the audio.
7. Optional `via: tail` distinguishes a tail-only interval from a direct contribution.
   `via: direct` is the default. A tail can outlast transport stop or deck replacement.
8. IDs are required only when another field refers to that play. Normalization generates IDs
   for anonymous rows. Generated IDs are deterministic within an input revision, but are not
   promised stable across row insertion; exporting an editable event log materializes IDs.
9. An explicitly annotated row without `deck` has an unknown deck. Legacy sequential rows keep
   their existing synthetic A/B rotation as compatibility metadata, marked as inferred.
   `deck: null` explicitly suppresses assignment. No UI should describe a synthetic assignment
   as observed hardware state.
10. Deck IDs become identifiers, such as `A`, `F`, or `left-3`, not an A-D enum. Optional deck
    definitions can supply labels, order, and colors. Accept existing A-D unchanged. A theme's
    layout capacity does not limit the data model's number of decks or simultaneous plays.

Use the same timing rules in both presentation modes. A mode change must never change which
recordings the timeline says contribute.

## The normalized model

The domain has four small concepts:

| Concept | Identity and responsibility |
| --- | --- |
| Recording | Metadata for one particular recording/version, reusable across plays. |
| Play | One occurrence of that recording in this performance, optionally associated with a deck. |
| Contribution | One interval in which a play belongs in the listener-facing mix, with optional tags, parts, or tail status. |
| Annotation | A point or passage describing the performance, referencing zero or more plays. |

Do not replace the existing public `Track` type in place. Introduce new types and preserve the
current metadata fields. Illustrative internal shapes:

```ts
type RecordingId = string;
type PlayId = string;
type DeckId = string;
type SpanId = string;

type TimingBasis = 'authored' | 'tracklist' | 'telemetry' | 'estimated' | 'sequence' | 'recording-end';

interface Recording {
  id: RecordingId;
  artist: string;
  title: string;
  label?: string;
}

interface Play {
  id: PlayId;
  recording: RecordingId;
  deck: DeckId | null;
  deckBasis: 'authored' | 'telemetry' | 'inferred' | 'unknown';
  background?: string;
}

interface Contribution {
  id: SpanId;
  play: PlayId;
  from: number;
  to: number | null;
  fromBasis: TimingBasis;
  toBasis: TimingBasis | null;
  tags: string[];
  parts: string[] | null;
  via: 'direct' | 'tail';
}
```

`to: null` is an open interval in a live log, not infinity serialized into JSON and not a claim
about when the track will finish. Offline compilation resolves `end` against audio duration
before rendering. `sequence` marks an inferred closing boundary separately from its authored
starting timestamp. An importer must identify whether its timestamp means a listing boundary,
mix entry, or deck load; an ordinary history export is not promoted to audible timing.

### One event timeline remains authoritative

YAML intervals compile to `mix_in` and `mix_out` events referencing play and span IDs. Keep
recording and play definitions alongside the log; the contribution intervals above are a
derived index for seeking, validation, and future-event queries, not another editable authority.
Definitions contain identity and metadata, not changing playback state.

```yaml
- {id: visitor-entry-1, time: 1:00, type: mix_in, play: visitor, span: visitor-tease-1, tags: [tease]}
- {id: visitor-exit-1, time: 1:08, type: mix_out, play: visitor, span: visitor-tease-1}
- {id: visitor-entry-2, time: 1:24, type: mix_in, play: visitor, span: visitor-tease-2, tags: [tease]}
- {id: visitor-exit-2, time: 1:32, type: mix_out, play: visitor, span: visitor-tease-2}
```

A boundary event has its own event ID, separate from the play and span IDs. Existing
`events[].id` keeps identifying the event; it is never silently reused as the play ID.
Both boundaries retain their timing origin and optional source reference. A `mix_out` closes
the named span, not whichever play happens to occupy its old deck at that later time.

A live adapter can emit the same boundaries without knowing the eventual end. Future
`play_define`, `deck_load`, `deck_unload`, and transport observations can record device state
separately. Definition records are logged before first reference and materialized into the
same tables during replay. Loading, playing, and being in the mix are independent.

Do not allow YAML intervals and manually authored `mix_in`/`mix_out` events to both own the same
play. The first release can expose only interval authoring and keep generated boundary events
internal. Live capture can expose direct events when that path is implemented.

`Timeline.at(t)` resolves the entire state from definitions and events at or before `t`, without
depending on which video frame rendered before it. Add an `EventState.mix` projection:

```ts
interface ActivePlay {
  play: Play;
  recording: Recording;
  contribution: Contribution;
}

interface MixState {
  inMix: readonly ActivePlay[];
  focus: readonly PlayId[];
}
```

`inMix` contains all current contributions, including explicitly marked assumptions from
sequential input. It does not pretend to enumerate every audible source in incompletely
annotated audio. A microphone or unidentified layer can be an explicit named input later;
absence of metadata never proves silence.

`focus` is editorial emphasis, potentially shared. It cannot add/remove contributions. In the
DJ preset, prefer the latest active non-tease entry by default; while only teases enter, keep
the existing active focus. Use canonical ordering for ties. If the focus exits, select from
the remaining contributions; if none remain, return an empty list. An explicit `focus` event
with `plays` overrides this policy until its selection leaves or another focus event occurs.
An empty selection restores automatic focus. Ended members are filtered out independently.

Both defaults and explicit focus are reproducible by replaying timeline events. Focus does not
claim which track is louder, supplies the bass, or is the tempo master.

## Musical moments and passages

Keep all existing event types and meanings. Extend them additively:

- `drop`, `double_drop`, and `rewind` can carry `plays: [playId, ...]` identifying participants
  in a mix-level event. A targeted `double_drop` names exactly two distinct play occurrences.
  A `drop` with three or more participants describes a shared drop without requiring
  `triple_drop`, `quadruple_drop`, and further event types. Participation is authored, never
  guessed from how many tracks happen to overlap.
- Untargeted legacy `double_drop` remains a valid global cue. It does not guess the two latest
  tracks, revive an old track, or close an overlap. Warn in the DJ preset that it cannot
  identify participating tracks until `plays` is supplied.
- A `play` field, singular, scopes `drop`, `breakdown`, or `buildup` to that play's musical
  structure. It is mutually exclusive with `plays`. These scoped events update the play's
  section and event history only. A breakdown in B must not replace the mix-level drop while
  A continues. Unscoped legacy events, including their old `deck` field, retain their existing
  mix-level behavior. Do not silently reinterpret legacy `deck` as a play reference.
- `passage` has `time`, `end`, optional `plays`, optional `label`, and `tags`. It represents a
  sustained blend, loop routine, tease, or any annotated passage. Passages can overlap. They
  do not impose mix entry/exit or change sections.
- `marker` has `time`, optional `plays`, and a `label`/`tags` for other moments. Use it for a
  bass swap or a named technique without adding a new state-changing event for every term.
- `focus` is an explicit presentation instruction. Existing `switch` retains its old deck
  emphasis behavior; it must not implicitly mute a deck or load its previous track.

For targeted drops, require participants to have an active direct contribution at the timestamp.
A tail alone is not a second dropping track. This checks internal consistency, not whether a
double drop can be verified acoustically. Rewind targets may identify a just-ending contribution
at that same timestamp, since a pull-up can close the mix interval. Passages require valid play
references but may include preparation time outside their audible intervals.

Keep `since(events, 'drop', t)` and existing modulation queries mix-scoped. Add separate,
explicit play-scoped queries. Do not collapse simultaneous play sections into one global value.

Tags are extensible descriptive strings. They cannot mutate state. Unknown core event types
still fail validation; a future registered plugin event must declare its schema and behavior.
Namespaced extension metadata can be retained without affecting rendering, but unknown
state-changing operations must never be silently ignored.

## A practical catalogue of mixing patterns

This is a coverage checklist, not a compulsory classification system. Techniques can coexist,
and some do not transition away from the current track at all.

| Performance pattern | Required representation | Optional annotation |
| --- | --- | --- |
| Cut or slam | A ends exactly when B begins. | `cut` marker. |
| Long blend or phrase mix | A and B overlap for any duration. | `blend` passage; phrasing notes. |
| Bass swap or filter mix | Both remain in the mix across the swap. | `bass-swap` marker; measured controls later. |
| Double or multiple drop | Two or more direct contributions plus one shared moment. | `double_drop` or targeted `drop`. |
| Rolling transition | Incoming drop while outgoing high-energy material continues. | Play-scoped drop and a `rolling` passage. |
| Transition into a breakdown | Contributions and mix-level energy can change independently. | Explicit global or play-scoped breakdown. |
| Tease without takeover | Short interval inside a continuing play, possibly repeated. | `tease` tag; no chapter or focus change by default. |
| Drop switch or fake-out | Actual entries/exits around the expected drop. | Marker; no assumption that both tracks drop. |
| Reload of one tune or a blend | Targeted rewind plus explicit exits/re-entries where applicable. | Source-position observations later. |
| Loop, acapella, or stem layer | A continuing contribution, optionally with `parts`. | `loop` passage or tag. |
| Beat juggling or instant doubles | Two occurrences sharing one recording identity. | Rapid intervals and source-position changes. |
| Echo or reverb out | Tail contribution can continue after direct contribution ends. | `via: tail`; echo-out marker. |
| Tempo or genre change | Mix timestamps remain seconds; no fixed-tempo prerequisite. | Tempo observations or beat map later. |
| Three, six, or more decks | Arbitrarily many play/deck IDs. | Performer and hardware metadata later. |

Do not require EQ curves to show a bass swap or source-position traces to show a reload.
Those details can be added without changing the identities or contribution intervals.

## Separate contribution from hardware and source time

Three questions must remain distinct:

1. Which recording occurrence is assigned to a deck, if known?
2. What is that deck doing, if observed: playing, paused, looping, or seeking?
3. Which recording occurrences should currently be credited as part of the mix?

A playing deck may only be in headphones. A loaded recording may never be heard. A stopped
deck may leave an effect tail audible. Channel level, crossfader assignment, EQ, stems, and
effect routing make a single fader value insufficient to establish contribution universally.
An adapter may derive contributions when its observed signals support that rule, retaining
the derivation's origin. A disconnect must become unknown state, not an invented mix-out.

Optional future source-position observations must use explicit `sourceSeconds` alongside mix
`time`. Do not calculate source position as `time - firstEntry`: pitch changes, loops, cue jumps,
and rewinds invalidate it. A future transport model needs piecewise mapping and explicit jumps;
the first contribution implementation does not need to solve that problem.

Likewise, `bpm`/`beatOffset` remain convenient constant-tempo input. A later beat or tempo map
can provide varying tempo and meter, with explicit phase anchors. Neither contribution
boundaries nor musical annotations should require 4/4 time or a constant BPM. Never move the
mix clock backwards on a rewind. Existing display-only `clockOffset` remains display-only.

## Playlist and DJ mix presets

Use `mode: playlist | dj` as a presentation preset, with `playlist` as the compatibility default.
It must not select a different timeline reducer or change the interpretation of an explicit end.

- **Playlist:** the current single-track panel and up-next behavior for existing projects. When
  richer overlapping data is supplied, show the selected focus and warn that this preset hides
  simultaneous credits. Do not erase the underlying contributions.
- **DJ:** show every in-mix recording occurrence. Keep compact credits present throughout each
  contribution; `panel.dwell` controls expanded detail rather than hiding the only identification.
  Re-entry and a targeted shared drop bring the relevant details back. Up next is off by default:
  a scheduled entry is not necessarily the next lead track and a loaded deck is not a promise.

If the DJ preset receives only timestamped sequential input, it can render it, with a warning
that overlap timing is unavailable. It should not manufacture a pair of active decks. Manual
end times and intervals improve the result incrementally.

The DJ layout arranges contributions, not two permanent player windows. Optional deck badges
show known assignments. Themes can use different layouts for one, two, or more credits, but
must not silently discard extra active plays. Two plays of the same recording remain separate
in state; a theme may group their shared title only if it retains both deck/play indicators.

Background selection follows editorial focus, with a documented first-focused fallback when
focus is shared. Global spectrum and meters still analyze the mixed audio. Do not draw separate
per-deck meters or waveforms by copying the master analyzer.

## Real fixture from the existing demo

The local Stakka & Skynet demo already stores mix observations in
`demos/stakka-skynet/demo.yaml`, `README.md`, and `timings.tsv`. Those are existing annotations,
not newly verified listening measurements. They refer to the 14:03–19:34 excerpt of the
[Knowledge Magazine mix source](https://www.youtube.com/watch?v=Nk_g9sGIBUY).

Using those annotations, the proposed minimal configuration is:

```yaml
audio: assets/clip.wav
mode: dj
clockOffset: 14:03
clockTotal: 56:06
tracks:
  - id: star-trails
    time: 0:00
    end: 1:31
    artist: Kemal & Rob Data
    title: Star Trails
    deck: A
  - id: pathogen
    time: 0:14
    end: 4:04
    artist: Stakka & Skynet
    title: Pathogen
    deck: B
  - id: clockwork
    time: 3:20
    end: 5:31
    artist: Stakka & Skynet
    title: Clockwork
    deck: A
```

Expected membership, on the audio file's clock:

| Interval | In the mix |
| --- | --- |
| 0:00–0:14 | Star Trails |
| 0:14–1:31 | Star Trails + Pathogen |
| 1:31–3:20 | Pathogen |
| 3:20–4:04 | Pathogen + Clockwork |
| 4:04–5:31 | Clockwork |

The first overlap lasts 77 seconds; the second lasts 44 seconds. A fixed short transition
window cannot describe both. The additional observations at 0:25, 1:12, and 3:31 can become
markers for a fully established blend or a fading departure. They do not justify fabricated
linear volume curves or musical drop markers.

## Determinism and validation

Normalize times, resolve identities, and validate before bundling or audio analysis that is not
needed for duration. Duration-dependent validation runs after the existing audio probe.

- Reject duplicate authored IDs, missing references, invalid times, negative or empty intervals,
  overlapping intervals within one play, and simultaneous timing forms. Errors name the YAML
  path, offending value, and correction.
- Allow gaps and any number of concurrent plays. Require neither a permanent lead nor exactly
  one active deck. An empty contribution set is valid and does not assert that the recording
  contains digital silence.
- Check known physical occupancy only against explicit load/unload observations. An audio
  annotation alone does not establish occupancy between teases. Two overlapping direct plays
  on the same declared deck warrant a warning for manual input; contradictory authoritative
  deck-load history is an error. An old effect tail can coexist with a new direct play.
- Validate targeted double drops against participation, not just a count of deck IDs. Report
  `events[3].plays: visitor is not in the mix at 2:20; correct its audible interval or this event's time`.
- Explicit nonempty focus selections must name active plays at the event time. An annotation's
  participant list contains unique IDs; an accidentally repeated ID does not create two plays.
- Explicit intervals beyond audio duration are errors. Only the `end` sentinel resolves to
  recording end; do not silently clamp incorrect written times. A render slice intersects the
  full timeline rather than changing the meaning of the input intervals.
- At one timestamp, materialize definitions, apply closing boundaries, apply opening boundaries,
  then resolve focus and annotations against the resulting state. A targeted rewind may also
  refer to the contribution that just closed. Preserve source order within a phase; assign
  canonical order numbers so serialization/replay does not depend on object enumeration or
  network arrival order. Existing legacy-only event ordering remains unchanged.
- In a future live log, event time and receipt time are separate. Persist a deterministic tie
  order. Duplicate event IDs are idempotent. Corrections/retractions reference stable event IDs
  and require replay from the affected point; they are not arbitrary last-arrival overwrites.
- Do not expose half-applied same-time state to a rendered frame. Every query at a timestamp
  sees the full batch for that timestamp and the same chosen log revision.

Render slices and clips must initialize from the full preceding event history. Cutting at 1:00
in the real fixture still begins with Star Trails and Pathogen active. Source history and any
panel entrance age must not reset merely because encoding begins later.

## Integration with current Setcast

Add normalized recording/play definitions to `ResolvedProject` and the mix projection to
`EventState`. Leave the Remotion adapter consuming a Setcast-owned `RenderFrame`. No Remotion
types or imports belong in the model.

Preserve existing `track`, `trackIndex`, `trackCount`, `deck`, `last`, `next`, and section
semantics for old configurations. Treat them as the legacy sequential view; do not repurpose
`track` as an array. For richer input, an explicit compatibility projection can emit one
`track_start` at the first contribution of each play. Such a view is necessarily lossy and
must not drive the DJ components, focus selection, or factual contribution queries. A scoped
musical event must not enter the legacy global `last`/`next` maps.

New components read `events.mix.inMix` and their own contribution age. Add per-play section
queries and CSS attributes rather than assigning every panel the stage root's deck or section.
Existing A-D deck color variables remain valid; new deck IDs need a documented theme fallback.
Global `--since-track` retains its legacy meaning; per-panel entry timing needs a separate name.

Chapters are navigation, not participation. Preserve existing exports for legacy input. For DJ
input, default chapter candidates to each play's first non-tease direct entry, with explicit
chapter events taking precedence. Group simultaneous candidates into one chapter, keep current
short-chapter warnings, and let users author the final navigation. A tease-only occurrence still
belongs in the full credits even if it never becomes a chapter. Re-entries should not inflate
the default track counter or produce a chapter for every mixer cut.

## Implementation scope and acceptance cases

The first implementation should include interval authoring, occurrence IDs, optional reusable
metadata, extensible/unknown decks, interval tags/parts/tail status, targeted moments, passages,
the pure timeline projection, and one DJ layout. It should also define the chapter and background
fallbacks above. This is enough to demonstrate the actual performance model.

Keep hardware capture, exact fader/EQ curves, source-position simulation, beat maps, automatic
overlap recognition, and plugin-defined state operations for later work. The first release must
not pretend that it already measures those things.

Use compact timeline fixtures to establish these contracts:

1. Legacy input produces the same legacy state and chapters as before.
2. The real demo produces the five membership intervals above, including exact boundaries.
3. A continuing play survives another play's repeated teases; the tease never has to take over.
4. A two-play drop targets both active occurrences, and a three-play drop needs no new type.
5. Reloading a blend changes contribution/source state only through explicit events, not by
   moving the mix clock or implicitly stopping every deck.
6. Two instances of the same recording have independent participation and identity.
7. A play-scoped breakdown does not change the mix's global section.
8. An effect tail can persist after a new recording occupies the originating deck.
9. Unknown deck and unknown transport state survive normalization without fabricated values.
10. Out-of-order frame queries, serialization/replay, and render slices yield the same state.
11. Switching presentation mode leaves all contribution intervals and their timing origins intact.
12. Invalid references, intervals, targeted drops, and conflicting ownership report actionable errors.

Before treating the proposal as an accepted public contract, implement these fixtures, migrate
the local real-mix demo without discarding its observations, inspect the multi-track layout in
landscape and portrait, and run the repository's normal readiness checks. Interviews establish
the required behaviors; the illustrative fixtures do not claim timestamp-level transcription
of every cited performance.
