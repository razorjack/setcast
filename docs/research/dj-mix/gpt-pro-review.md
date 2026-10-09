## A. Verdict

**Usable with revisions. The core model does not need replacing, but the proposal is not ready to become a public contract.**

Recording identity, play identity, contribution intervals, and annotations are useful distinctions. The consequential problems are in their proposed semantics: implicit ends depend on unrelated rows; play identity partly depends on unobserved hardware history; static deck associations cannot describe transfers cleanly; contribution defaults overstate what is known; and several presentation and event-ordering rules remain ambiguous.

I recommend retaining the core distinctions while simplifying the contract:

**A play is an explicitly identified appearance of a recording. Contributions describe when Setcast credits that appearance. Tracklist timestamps remain navigation anchors and provide a documented fallback when contribution timing is absent. Hardware observations and source playback positions are not inferred.**

This review is based on the proposal, research attachment, and `AGENTS.md`. No implementation source or demo audio was attached. Compatibility findings therefore concern the documented public contract, not verified implementation behavior. The guide explicitly identifies the event schema as a stable public interface and describes the existing sequential state and deck behavior. AGENTS

### Evidence assessment

The strongest evidence supports concurrent appearances, repeated teases, and independent copies of the same recording. The checked Andy C interview describes teasing material over a continuing track and pulling up mixes; Serato documents independently manipulable copies with matched playhead positions. These support the proposed distinctions, but not a universal rule for deciding when an appearance becomes a new play. [UKF](https://ukf.com/read/andy-c-2017-so-far/)

The research attachment is weaker than the proposal’s evidence section. It names sources without providing traceable claim-level citations, and recommends automatic phrase alignment and constant-tempo assumptions that the proposal correctly avoids. Its statement about 94% using one-semitone shifts omits the denominator: the paper reports that **94.3% of the transposed subset**, not all tracks, shifted by one semitone. The dataset predominantly covers house and trance; its aggregate tempo statistics do not establish linear source-time behavior or suitable jungle defaults. deep-research-report (2) deep-research-report (2) [arXiv](https://arxiv.org/html/2008.10267v1)

Effect-tail scenarios are useful engineering counterexamples, but the research explicitly labels its tail requirement an inference. They should not be presented as measured evidence about frequency or exact durations. deep-research-report (2)

## B. Most consequential findings

### 1. Adding an overlay can silently remove an unrelated continuing track

**Classification: acknowledged design tradeoff with an unacceptable default consequence.**

The proposal infers an omitted end from the next row’s first contribution, including an `audible` row. It acknowledges that adding a tease can change another play’s end, but warns only when the closing row has a recognized tease tag. dj-mix-model

Before, using proposal syntax:

```yaml
tracks:
  - {time: "0:00", artist: Artist A, title: Foundation}
  - {time: "3:00", artist: Artist B, title: Successor}
```

The author then adds a visitor without intending to change Foundation:

```yaml
tracks:
  - {time: "0:00", artist: Artist A, title: Foundation}
  - artist: Artist V
    title: Visitor
    audible:
      - {from: "1:00", to: "1:08", tags: [tease]}
  - {time: "3:00", artist: Artist B, title: Successor}
```

Under the proposal:

| Time | Intended result of adding the visitor | Proposed result |
|---|---|---|
| 0:59 | Foundation | Foundation |
| 1:04 | Foundation + Visitor | Visitor |
| 1:08 | Foundation | No credited play |
| 3:00 | Successor | Successor |

This is not merely a different inferred fade. It removes almost two minutes of credits. Removing the tag removes the proposed warning without correcting the behavior.

**Smallest local correction:** add `end: "3:00"` to Foundation.

**Recommended systemic correction:** only **listing timestamps** participate in sequential end inference. An interval-only overlay must not become another row’s implicit closing boundary. Adding a new listing timestamp may still change the preceding shorthand interval, because that is the established meaning of editing a sequential tracklist.

There is a related problem: the proposal makes `time` and `audible` mutually exclusive, then generates chapters from first contributions. An existing chapter at 3:20 cannot remain attached to a play whose newly annotated contribution starts at 2:50 without being recreated elsewhere. That unnecessarily destroys information while enriching the project. dj-mix-model dj-mix-model

Allow `time` alongside explicit contribution intervals. Its meaning remains the listing/navigation timestamp; explicit intervals replace only the fallback participation window.

**Cost:** one clear precedence rule. A contribution-only row does not automatically create a chapter. Authors add a listing timestamp when they want one.

### 2. Zero-length legacy entries conflict with the proposed boundary ordering

**Classification: definite conflict unless explicitly special-cased.**

The proposal preserves inferred zero-length entries for legacy input, while ordering all closing boundaries before opening boundaries. dj-mix-model dj-mix-model

Consider two sequential entries at `0:00`. Under the proposal’s shorthand, the first can receive the empty interval `[0, 0)`.

A literal compilation produces:

```text
0:00 mix_out span-a
0:00 mix_in  span-a
```

Applying closes before opens either rejects the unmatched close or leaves `span-a` open. Neither represents an empty interval.

**Correction:** retain the original legacy `track_start` event, including its historical ordering and counting effects, but generate **no contribution boundaries for an empty inferred window**. Explicitly authored empty intervals remain invalid.

This illustrates why preserving the legacy projection cannot mean blindly translating every old row into ordinary new boundary events.

**Cost:** a narrowly defined normalization exception and a regression fixture. No change to public legacy event meanings.

### 3. “One play” is not a hardware session, and `Play.deck` cannot be timeless

**Classification: underspecified identity policy and a concrete representation limitation.**

The proposal says unloading and loading creates a new occurrence, but unknown loading history leaves grouping to the annotator. Those are different identity criteria. It also stores a single deck on the play definition while stating that definitions do not contain changing playback state. dj-mix-model dj-mix-model dj-mix-model

Consider one continuing appearance transferred from deck A to deck B at 1:00. The author knows the transfer happened but does not regard it as a second appearance.

The proposed shape requires one of three undesirable choices: retain a now-incorrect deck, omit known information, or manufacture another play.

Conversely, the same recording copied to another player and independently manipulated may need two plays. Serato’s documentation supports that distinction, but does not make every load operation a separate audience-facing appearance. [Serato Support](https://support.serato.com/hc/en-us/articles/202538250-How-does-instant-doubles-work)

**Correction:** define a play as an **explicit grouping identity**, not a discovered transport lifecycle:

> All contribution intervals carrying one play ID belong to the same annotated appearance. Independent appearances use separate IDs. Loading, unloading, device transfer, elapsed silence, and source-position changes do not automatically create or merge play IDs.

Move the optional deck association to contribution intervals. A row-level `deck` remains convenient shorthand for those intervals.

A tail’s association means “originated from A,” not “currently occupies A.” Actual occupancy requires separate observations.

**Cost:** grouping is partly editorial. Two annotators may group a reload differently. That is defensible, but it means play count must not be marketed as an objectively determined number of songs.

### 4. `audible` and default `via: direct` promise more than the model knows

**Classification: semantic ambiguity plus an avoidable fabricated default.**

The proposal alternately describes physical contribution, belonging in the listener-facing mix, and crediting. It explicitly includes rests and low-volume passages, so `audible` is already not literal audibility. Nevertheless, omitted `via` becomes `direct`. dj-mix-model dj-mix-model dj-mix-model

An annotator may know that a recording remains recognizable without knowing whether the remaining material is dry audio, a stem, a loop buffer, or effects. A tracklist establishes even less.

**Correction:** name the field `contributions` and define it as Setcast’s credited participation interval. It is neither a sound detector nor a routing assertion.

Use an optional positive assertion such as `tail: true`, meaning **tail-only contribution**. Omission means that the contribution mechanism is unspecified, not that dry/direct routing was established.

This does not require separate systems for acoustic activity, musical participation, and editorial credit. For this product, a single credited-participation timeline is enough, provided its limits are explicit:

- Natural rests do not require interval fragmentation.
- A quiet but credited layer may remain represented.
- A contribution does not assert that the original arrangement is present.
- Missing contributions do not establish silence or complete identification.

Serato’s stem functionality supports the last arrangement distinction; it does not require Setcast to introduce a stem-routing model. [Serato Support](https://support.serato.com/hc/en-us/articles/5700968326927-Stems-Overview)

The timing-origin fields should likewise describe how an effective boundary was obtained, not imply acoustic certainty. `authored`, `estimated`, `telemetry`, and `sequence` currently mix provenance, inference policy, and precision in one enumeration.

**Cost:** consumers cannot interpret an omitted routing field as a known direct signal. That is a necessary restriction, not lost useful information.

### 5. Targeting, section scope, and same-time precedence need one explicit contract

**Classification: underspecified behavior with visible consequences.**

The distinction between:

```yaml
{type: drop, play: a}
```

and:

```yaml
{type: drop, plays: [a]}
```

changes whether an event affects local or global state. A pluralization is carrying more semantic weight than its name communicates. dj-mix-model

There is another gap. Suppose A’s last scoped section is `breakdown`, B’s is `buildup`, and a targeted `double_drop` names both at 1:00. Does that update both local sections, or only the mix section? The proposal clearly defines local events but not this consequence of a targeted shared drop.

If both a targeted shared drop and B’s scoped breakdown occur at exactly 1:00, “preserve source order” provides reproducibility only after someone defines whether those writes conflict and which projection they affect.

**Correction:**

Use an explicit scope discriminator for local sections:

```yaml
{time: "1:10", type: breakdown, scope: {play: b}}
```

Keep `plays` for participants in a mix-level moment.

For the new targeted contract, I recommend:

> A targeted mix-level drop updates the mix’s drop state and supplies a local drop annotation to each named participant. An untargeted legacy drop updates only the legacy mix state. A scoped section event updates only its named play.

These are projections of one event, not separately editable duplicate events. Reject conflicting new writes to the same local section at the same timestamp. Preserve existing ordering for legacy global events.

Reset the local section to unknown after a genuine contribution gap; do not display a previous run’s section as though the resumed source position were established.

Keep the proposal’s useful boundary distinction: drops validate against post-boundary membership; rewinds may also reference a contribution ending at that timestamp. dj-mix-model

**Cost:** a documented targeting rule and conflict validation. It avoids additional event types and ambiguous local/global effects.

### 6. Descriptive tags secretly control focus and chapters; interval splits can become false entrances

**Classification: contract conflict and underspecified presentation behavior.**

The proposal says tags cannot mutate state, but `tease` changes focus selection and chapter generation. That makes a free-form label a behavioral instruction. dj-mix-model dj-mix-model dj-mix-model

A spelling change from `tease` to `teaser` can therefore change the background and navigation. This is not merely styling.

Adjacent intervals introduce a separate problem. A direct contribution ending at 1:00 followed by its tail at 1:00 is continuous credit. Treating the second `mix_in` as a new entrance can restart panel dwell, affect focus, or produce a false “track returned” animation.

**Correction:** tags remain descriptive. Explicit focus handles editorial exceptions; listing timestamps handle default chapters.

Define a **contribution run** as a maximal uninterrupted period of membership for one play. Adjacent intervals belong to the same run even when deck or contribution details change. A run is derived, not another authored entity.

Use run starts, rather than every span start, for default attention and entrance age.

For automatic focus, prefer the latest-started active run that is not explicitly tail-only; use a deterministic fallback when only tails remain. An explicit focus selection overrides that policy.

**Cost:** a repeated-tease example needs one explicit focus event. That is smaller and more predictable than giving an extensible tag vocabulary hidden behavioral semantics.

### 7. Open intervals do not solve unknown state, and event-time replay is not necessarily live-output replay

**Classification: a model-level gap now; delivery mechanisms can be deferred.**

The proposal rightly says a disconnect must become unknown rather than an invented mix-out. But an unmatched `mix_in` with `to: null` ordinarily remains active forever. Nothing in the illustrated state expresses loss of knowledge. dj-mix-model dj-mix-model

Example:

```text
0:00 contribution begins
1:00 adapter disconnects
1:30 query
```

Neither “definitely still contributing” nor “definitely stopped at 1:00” follows from that log.

There is also a stronger replay issue. The existing visual contract includes future-looking `until()` queries and total track counts. AGENTS

If a drop at 2:00 is first received at 2:02, an offline renderer with the completed log can show a pre-drop ramp at 1:59. The live renderer could not have shown that ramp from an event it had not received. Deterministic event-time replay does not resolve this difference.

**Correction now:** make the first renderable offline contract finalized and finite. Do not publicly equate `null` with continuing known participation. A future incomplete capture must carry an availability/coverage contract or require reconciliation before becoming a finalized offline timeline.

Define the reproducibility promise precisely:

> The same finalized timeline revision, presentation settings, assets, and analysis inputs produce the same state and visuals at the same mix time.

Exact reproduction of what viewers saw live is a stronger future feature. It requires preserving what information was available when, including late-event handling and any live presentation decisions.

**Cost:** an incomplete raw capture is not automatically a faithful finalized project. Receipt-time replay, reconnect handling, and correction infrastructure remain deferred, but their absence cannot be hidden behind `to: null`.

## C. Recommended minimal model

### Authoring semantics

Retain `tracks` for compatibility. Every row describes one play, with optional recording reuse.

`time` is its listing/navigation timestamp. When explicit contribution timing is absent, it also provides the established sequential presentation fallback.

The rules should be:

| Input form | Participation meaning |
|---|---|
| `time` only | Sequential fallback until the next listing entry, or mix end |
| `time` + `end` | An explicitly declared contribution window |
| `contributions` only | Explicit intervals; no implicit listing/chapter entry |
| `time` + `contributions` | Preserve the listing timestamp; intervals exclusively determine participation |

`end` and `contributions` are mutually exclusive. A row without either `time` or nonempty `contributions` is invalid.

Only rows with listing timestamps, including legacy `track_start` inputs, participate in sequential inference. Their established tie order remains significant. Empty inferred windows produce no contributions.

This preserves simple authoring while making overlay edits local. It does not make inferred timing factual: fallback windows retain their origin, and an overlap involving fallback timing remains partly assumed.

Keep `end: end` and `to: end` as input-only sentinels. They mean the supplied mix audio’s duration, never the original recording’s duration. Reject `null` as an offline end.

### Identity rules

| Scenario | Recommended identity |
|---|---|
| Repeated teases grouped as one appearance | One play, several intervals |
| Pull-up/reload of that appearance | Same play unless explicitly authored as a new appearance |
| Later independent replay | Another play referencing the same recording |
| Transfer between devices without independent parallel use | Same play; contribution association changes |
| Two independently credited copies at once | Two plays referencing the same recording |
| A continuing sampler loop | One play if annotated as one appearance; no source-position simulation |

These rules deliberately do not claim automatic recoverability from audio or loading history.

A recording ID asserts shared recording/version identity. Matching artist/title strings do not establish that identity. Unknown placeholders are not automatically merged.

### Concise normalized shapes

The following are contract sketches, not an implementation or a replacement for the existing public event union:

```ts
type RecordingId = string;
type PlayId = string;
type SpanId = string;
type DeckId = string;
type Seconds = number;

interface Recording {
  id: RecordingId;
  artist: string;
  title: string;
  label?: string;
}

interface Play {
  id: PlayId;
  recording: RecordingId;
  background?: string;
}

type BoundaryOrigin =
  | "annotation"
  | "tracklist"
  | "next-listing"
  | "mix-end";

interface ContributionDetails {
  deck: DeckId | null;
  tail?: true;
  tags: readonly string[];
}

interface Contribution extends ContributionDetails {
  id: SpanId;
  play: PlayId;
  from: Seconds;
  to: Seconds;
  fromOrigin: BoundaryOrigin;
  toOrigin: BoundaryOrigin;
}

interface EventStamp {
  id: string;
  time: Seconds;
  order: number;
}

type BoundaryEvent = EventStamp & (
  | ({
      type: "mix_in";
      span: SpanId;
      play: PlayId;
      origin: BoundaryOrigin;
    } & ContributionDetails)
  | {
      type: "mix_out";
      span: SpanId;
      origin: BoundaryOrigin;
    }
);

type SectionType = "drop" | "breakdown" | "buildup";

type PlaySectionEvent = EventStamp & {
  type: SectionType;
  scope: {play: PlayId};
};

type FocusEvent = EventStamp & {
  type: "focus";
  plays: readonly PlayId[];
};

type MarkerEvent = EventStamp & {
  type: "marker";
  end?: Seconds;
  label: string;
  plays?: readonly PlayId[];
};
```

Existing musical event payloads remain intact. Add `plays` to the designated mix-level moment types rather than replacing their current fields. Normalized records retain any existing intensity information.

`Contribution` is a **derived read index** when boundary events are canonical. It is not another editable source.

I would rename the proposed optional YAML `library`/`track` pair to `recordings`/`recording`. This makes the reference target unambiguous while leaving the established `tracks` key unchanged. Inline metadata and a recording reference remain mutually exclusive; per-play artwork remains allowed.

### Invariants

For finalized offline data, all contribution intervals satisfy `0 ≤ from < to ≤ duration`. Membership is half-open. Intervals belonging to one play do not overlap; adjacent intervals form one continuous run.

A play is credited at time `t` exactly when one of its intervals contains `t`. This is not a claim to enumerate every sound in the master recording.

`tail: true` means the credited contribution is tail-only. Omission leaves the mechanism unspecified. Concurrent direct audio and its effects do not require separate signal paths merely to credit the same play once.

Deck associations are optional context. They neither create membership nor prove occupancy. Synthetic legacy A/B rotation belongs in the legacy presentation projection, not in the factual association.

Times remain Setcast-owned mix seconds, independent of frame rate. Normalize once, retain the normalized values through serialization, and do not introduce frame snapping or undocumented epsilon-based ordering.

### Focus, sections, and navigation

Keep focus in a presentation projection rather than treating it as another participation fact.

Automatic focus selects the latest-started eligible active run, with a persisted tie order. Known tail-only contributions are fallback candidates. Explicit focus selects an ordered list of currently active plays. When a selected play leaves, remove it from the pinned selection permanently; its later return does not resurrect the old selection. When the selection becomes empty, resume automatic focus. `plays: []` explicitly restores automatic focus.

A genuine gap resets a play’s local section to unknown. Adjacent metadata changes do not. Targeted drops supply local drop annotations to their participants; unscoped legacy events do not guess participants.

Default chapter candidates come from listing timestamps, not contributions, focus, or descriptive tags. For rich input, I recommend that a nonempty explicit chapter list replace automatic candidates as a whole. This is easier to reason about than an unspecified per-chapter “precedence” merge.

The DJ preset should not display an unlabeled “track count.” Recording count, play count, listed-entry count, and current contribution count answer different questions. Preserve the existing counter for legacy presentation; default to no global counter in the new DJ layout.

### Simpler alternatives and authority

| Approach | Advantage | Cost |
|---|---|---|
| Canonical intervals; events derived | Simplest seeking and manual validation | Live input needs a materializer before it becomes a finalized interval snapshot |
| Interval YAML compiled to canonical boundaries | Fits Setcast’s documented event architecture; friendly authoring | Requires correct pairing, batching, and empty-window handling |
| Direct boundary-event authoring | Natural for capture and precise log editing | Manual authors must manage pairs, span IDs, ordering, and incomplete sequences |

All three can express the required participation semantics. Events are not inherently more faithful than intervals.

**Recommendation:** use interval authoring compiled to immutable boundary events, because Setcast already exposes an event timeline. Choose one editable input document for a project revision: authored YAML or an imported event log. Do not merge independently editable intervals and boundary events, even for disjoint plays, in the first release.

An even smaller display-only model could inline metadata into each play and omit reusable recording definitions. It would render these examples, but would lose explicit shared recording identity. The optional recording dictionary earns its small cost here.

## D. YAML examples

These examples use the recommended revised syntax. They are hypothetical fixtures, not transcriptions of performances. Written endpoints must fit the actual mix file.

### Unchanged basic tracklist

```yaml
audio: assets/mix.wav
tracks:
  - {time: 0:00, artist: First Artist, title: First Track}
  - {time: 3:20, artist: Second Artist, title: Second Track}
```

No new keys, IDs, deck assignments, or mode selection are required. Existing presentation remains unchanged.

### One long blend

```yaml
audio: assets/mix.wav
mode: dj

tracks:
  - time: "0:00"
    end: "3:45"
    artist: First Artist
    title: First Track

  - time: "3:20"
    artist: Second Artist
    title: Second Track
```

Both are credited on `[3:20, 3:45)`. The second play’s final end remains a sequential fallback.

If later annotation establishes that the second play entered before its listing timestamp, preserve both facts:

```yaml
  - time: "3:20"
    artist: Second Artist
    title: Second Track
    contributions:
      - {from: "2:50", to: end}
```

The chapter stays at 3:20; participation starts at 2:50.

### Repeated teases without takeover

```yaml
audio: assets/mix.wav
mode: dj

tracks:
  - id: foundation
    time: "0:00"
    end: end
    artist: First Artist
    title: Foundation

  - id: visitor
    artist: Second Artist
    title: Visitor
    contributions:
      - {from: "1:00", to: "1:08", tags: [tease]}
      - {from: "1:24", to: "1:32", tags: [tease]}
      - {from: "2:00", to: "2:06", tags: [tease]}

events:
  - {time: "0:00", type: focus, plays: [foundation]}
```

Visitor is credited during each interval, without changing focus or generating chapters. Deleting the tags changes neither result.

### A double drop followed by a reload

```yaml
audio: assets/mix.wav
mode: dj

tracks:
  - id: a
    time: "0:00"
    artist: First Artist
    title: First Track
    contributions:
      - {from: "0:00", to: "1:00"}
      - {from: "1:08", to: "3:00"}

  - id: b
    time: "0:40"
    artist: Second Artist
    title: Second Track
    contributions:
      - {from: "0:40", to: "1:00"}
      - {from: "1:08", to: "3:00"}

events:
  - {time: "0:48", type: double_drop, plays: [a, b]}
  - {time: "1:00", type: rewind, plays: [a, b]}
  - {time: "1:08", type: double_drop, plays: [a, b]}
```

At 1:00 neither play remains credited, but the rewind may reference the contributions that just ended. The gap and return are explicit; `rewind` does not manufacture them or move the mix clock.

### Two plays of the same recording

```yaml
audio: assets/mix.wav
mode: dj

recordings:
  break-record:
    artist: Example Artist
    title: Example Break

tracks:
  - id: first-copy
    recording: break-record
    time: "0:00"
    end: "1:30"

  - id: second-copy
    recording: break-record
    contributions:
      - {from: "0:30", to: "1:00"}
```

From 0:30 through just before 1:00 there are two active plays of one recording. No deck information is required.

Moving the second interval to `[2:00, 2:30)` expresses a later independent appearance without changing recording identity.

### An effect tail surviving deck reuse

```yaml
audio: assets/mix.wav
mode: dj

tracks:
  - id: outgoing
    time: "0:00"
    artist: First Artist
    title: Outgoing
    contributions:
      - {from: "0:00", to: "1:00", deck: A}
      - {from: "1:00", to: "1:10", deck: A, tail: true}

  - id: incoming
    time: "1:02"
    end: end
    deck: A
    artist: Second Artist
    title: Incoming
```

At 1:05, Outgoing’s tail and Incoming are both credited. A suitable badge is “tail from A” for Outgoing, not an assertion that Outgoing still occupies A.

This expresses the audience-facing result of deck reuse. It does not pretend to log the load operation itself.

## E. Boundary-state examples and acceptance properties

### Exact boundary expectations

| Fixture and time | Expected credited state | Additional expectation |
|---|---|---|
| Blend, 3:19.999 | First Track | First focus |
| Blend, 3:20 | First + Second | Second becomes automatic focus |
| Blend, 3:45 | Second only | First is absent at its endpoint |
| Teases, 1:04 | Foundation + Visitor | Focus remains Foundation |
| Teases, 1:08 | Foundation only | Visitor is absent |
| Reload, 1:00 | Empty | Targeted rewind is valid against just-ended contributions |
| Reload, 1:08 | A + B | Targeted double drop is valid against post-boundary membership |
| Duplicate recording, 0:30 | Both copies | Two plays, one recording identity |
| Duplicate recording, 1:00 | First copy only | No identity-based merging |
| Tail, 1:00 | Outgoing, tail-only | Same continuous credit run; no fresh entrance |
| Tail, 1:02 | Outgoing tail + Incoming | Incoming is automatic focus |
| Tail, 1:10 | Incoming only | Tail is absent at its endpoint |

Add this event to the reload fixture:

```yaml
- {time: "0:50", type: breakdown, scope: {play: b}}
```

At 0:50, the mix retains its existing `double_drop` section, A’s local section is drop, and B’s local section is breakdown. The scoped event does not enter the legacy global `last`/`next` maps.

For explicit focus, suppose A and B are selected together, A ends at 0:20 and returns at 0:25, and B ends at 0:30. Focus is `[B]` at both 0:20 and 0:25. At 0:30 the pin expires and automatic focus can select A. A’s return must not silently reactivate the old shared pin.

### Same-time resolution

Resolve definitions and the entire boundary batch before exposing membership. Then validate and resolve annotations and explicit focus against that completed state.

A drop requires post-boundary participation and must reject a known tail-only participant. A rewind may reference a play active immediately before or after the boundary. A general marker may reference a valid play outside its contribution intervals because it does not assert current participation.

A targeted drop outside sequence-derived fallback windows should be diagnosed as **insufficient contribution annotation**, not proof that the recording was acoustically absent. Require correction of the timing or use a non-state-asserting marker; do not silently revive a play.

Conflicting new same-time section writes are errors. Same-time legacy behavior retains its existing contract.

### Acceptance properties

| Property | What it must establish |
|---|---|
| Legacy parity | Old configurations retain legacy state, event ordering, chapters, counters, deck rotation, and modulation meanings |
| Edit locality | Inserting or moving an interval-only overlay cannot change another play’s inferred boundaries |
| Boundary algebra | Membership follows `[from, to)`; empty legacy windows create no ghost participation; no half-applied batch is observable |
| Identity independence | Two plays can share a recording; one play’s repeated intervals do not create extra appearances |
| Segmentation neutrality | Splitting an interval into adjacent intervals with identical details changes neither focus nor entrance age nor sections |
| Separation of concerns | Tags, markers, chapters, focus, deck associations, and presentation mode do not create or remove contributions |
| Annotation consistency | Targets are unique and valid; shared drops affect their specified projections; scoped events do not leak globally |
| Query determinism | Random seeks, chronological queries, serialization/reload, and slices agree for a fixed revision and presentation input |

The existing demo’s five documented membership ranges are also suitable acceptance fixtures, but should retain their status as existing annotations rather than independently verified listening measurements. dj-mix-model dj-mix-model

For future capture, add separate properties: identical duplicate event IDs are idempotent; the same ID with a different payload is a conflict; corrections create a new effective revision; disconnects invalidate knowledge rather than invent exits. Those are future capture requirements, not reasons to implement a distributed event system now.

## F. Compatibility and migration rules

**Preserve the old projection explicitly.** Existing `track`, `trackIndex`, `trackCount`, `deck`, `section`, `last`, `next`, and `all` must retain their documented meanings for old configurations. Internal boundary events should not unexpectedly appear in old public event collections or double the apparent track starts. The guide also defines `drop` helpers to include `double_drop`; that equivalence must survive. AGENTS

**Normalize both legacy input paths.** `tracks` is documented sugar for `track_start`; do not handle only the sugar while ignoring valid direct events. Establish an internal correspondence between a legacy start and its generated play, but never reuse `events[].id` as a play ID. Do not emit a second synthetic legacy start for the same original event.

**Do not migrate navigation to first contribution.** Preserve an existing listing timestamp when explicit intervals are added. The proposal’s first-contribution compatibility projection is lossy and can move chapters, up-next timing, backgrounds, and indices together. It should not be the default migration path. dj-mix-model

**Keep synthetic decks visibly synthetic.** Old presentation can continue alternating A/B. New contribution state should not turn that rotation into an observed association. Adding an ID, marker, or explicit end should not unpredictably change unrelated legacy deck assignments. `deck: null` means no known assignment and suppresses the shorthand assignment; it does not assert that no hardware exists.

**Materialize IDs when they become durable references.** Anonymous rows remain convenient. Before exporting an editable canonical log, materialize recording, play, span, and event IDs. Their stability need not survive arbitrary edits to an anonymous YAML source, but exported references must not be recomputed from mutable artist/title strings.

**Resolve duration once against the full mix.** A render slice intersects the established timeline. It does not reinterpret `end`, restart contribution age, or reset focus history. Explicit new interval endpoints outside the audio are errors; do not silently tighten unrelated legacy warning behavior without checking the existing contract.

**Keep presentation changes opt-in.** `mode: playlist` remains the compatibility default. DJ layout keeps compact identification present for every credited play while dwell controls expanded detail. Background selection follows ordered editorial focus, not volume or bass leadership. Up next remains disabled by default for DJ presentation; a future version should distinguish a known upcoming contribution from a promised next lead track.

The proposal’s renderer boundary is correct: this remains Setcast-owned data and projection logic consumed through the existing rendering seam, without Remotion types in the model. dj-mix-model

## G. Implement now / defer / reject

### Implement now

Implement explicit contribution intervals and the existing sequential fallback; recording references and play IDs; half-open boundary resolution; interval-level optional deck association; positive tail-only annotation; descriptive tags; targeted existing musical moments; explicit local section scope; explicit focus; and one marker form with an optional end for sustained descriptive passages.

Include the pure query projection, legacy compatibility projection, navigation rules, persistent compact DJ credits, deterministic background selection, and meaningful validation. Preserve boundary origins without building a general confidence framework.

### Defer

Defer live adapters, raw telemetry persistence, receipt-time replay, correction/retraction protocols, disconnect recovery, transport state, occupancy validation from hardware logs, source-position mappings, beat maps, quantitative uncertainty, and automatic overlap detection.

Also defer structured `parts` unless a concrete component needs machine-readable stem information. A descriptive label can communicate “vocals” without defining a universal stem taxonomy. Deck registries with configurable colors and ordering can wait; arbitrary IDs with documented style fallback are sufficient initially.

Defer public direct-boundary authoring until its validation and editing workflow actually exist.

### Reject

Reject hardware loading as the universal definition of play identity; default direct routing; automatic phrase snapping or source-time reconstruction; inferring participants from overlap counts; treating a rewind as an implicit set of exits; and treating a loaded deck as “up next.”

Reject magic behavioral tags, simultaneous writable interval and event authorities, fabricated per-deck meters from master audio, and a separate event type for every named DJ technique.

Reject the claim that event-time replay alone guarantees exact reproduction of previously observed live output.

## H. Specific amendments to the proposal

| Proposal section | Amendment |
|---|---|
| **Precise input semantics, rules 1–2** | Allow a listing `time` alongside explicit `contributions`. Infer sequential ends only from listing entries, never interval-only overlays |
| **Teases and returns** | Rename `audible` to `contributions`; define credited participation rather than physical audibility |
| **Play identity, rule 5** | Remove unloading/reloading as the normative identity boundary. Define identity through explicit grouping and independent appearances |
| **Normalized `Play` / `Contribution`** | Move canonical deck association from play to contribution; retain row-level shorthand |
| **Contribution details, rules 6–7** | Make tags non-behavioral; replace default `via: direct` with an optional positive tail-only assertion; defer structured parts |
| **One event timeline remains authoritative** | Select one editable project representation per revision. Keep the interval index derived and generated boundaries internal initially |
| **Musical moments and passages** | Introduce explicit local scope; specify targeted-drop projection effects and same-time conflicts; combine generic point/passage description into one marker form |
| **Focus rules** | Remove tag-dependent focus behavior. Define continuous runs, partial pin expiry, no resurrection on re-entry, and deterministic tail fallback |
| **Determinism and validation** | Suppress contribution events for empty legacy windows; separate post-boundary drop validation from rewind boundary references |
| **Live compatibility** | Separate finalized offline timelines from partial capture state; distinguish final-timeline replay from historical live-output replay |
| **Integration and chapters** | Preserve listing timestamps rather than regenerating legacy starts from first contributions; define explicit chapter replacement and counter semantics |
| **Implementation scope** | Remove speculative live operations, structured stem state, and deck-definition machinery from the first release |

The resulting design still has recordings, plays, contributions, and annotations. Its improvement is not a larger schema. It is a smaller set of promises: **explicit identity, local interval edits, deterministic credited participation, and presentation choices that do not masquerade as playback facts.**