# Evidence and decisions behind the DJ mix model

Status: research and decision record, 9 October 2026. The normative proposal is
[DJ mix model and authoring format](dj-mix-model.md). Neither document describes implemented
multi-play behavior. This record explains what supports the design, what remains uncertain,
and which recommendations were deliberately rejected.

## Inputs and their authority

Three original inputs are preserved verbatim, including their original punctuation and mistakes:

- **I01: [Initial Setcast proposal](research/dj-mix/initial-proposal.md).** The earlier research,
  source review, repository inspection, and first design. It is superseded by the linked
  specification. Its implementation observations and source links remain useful; its proposed
  semantics are not evidence that those semantics work.
- **I02: [GPT Pro review](research/dj-mix/gpt-pro-review.md).** User-supplied `pasted-text.txt`.
  A design critique of I01 and I03, not an independent performance study. The review states it
  did not receive implementation source or demo audio. Its counterexamples are reasoning
  fixtures, not observed DJ sets. Findings G01–G07 below preserve its material objections.
- **I03: [Deep Research report](research/dj-mix/deep-research-report.md).** User-supplied
  `deep-research-report (2).md`. It names interviews, tools, and a study, but contains no
  traceable source URLs or claim-level citations. Treat it as a synthesis and source lead,
  not independent corroboration. Its precise scenario timings are illustrative, not measured.

The earlier [interactive timeline illustration](research/dj-mix/initial-timeline.html) is also
archived unchanged. It accompanies the initial proposal, not the revised specification, and
uses styling variables supplied by its original visualization host.

Archive SHA-256 values, for verifying the exact reviewed inputs:

```text
I01 3f70af7918fe3569d07584dc288c4ff785f6872dc7cba208bf8d17af8a3e292e
I02 5a4e0b4538e98780afcece6e27e9fb8b2bfc50ea53fb195771fde7dd355b9a71
I03 40b5b800a777f5ce99d61288df5cb57b03ee8cd14562c0afeea527db330fee7b
```

The facts below consolidate the earlier research and both reports, with primary or direct
sources where available. Agreement between two model-generated reports is not a second
observation. A published interview is evidence of what the artist reports, not an independently
timed transcription. A product manual establishes a supported operation, not its prevalence.
A research dataset has its own sampling and measurement limits. A design decision can be
justified by a counterexample without being a statistical claim about common practice.

## Sourced findings

### F01: Participation can be repeated, concurrent, and not a handoff

In his account of the 2017 XOYO residency, Andy C describes a Calibre track rolling for six
minutes while he teased *Circles* in and out, a double drop of *The Pulse* and *The Beginning*,
and pulling up whole mixes. These are concrete artist-reported cases of repeated participation,
shared moments, and reloads affecting more than one track.
[UKF: Andy C, 2017 so far](https://ukf.com/read/andy-c-2017-so-far/).

His All Night interview separately describes using three or four decks, letting some material
roll, teasing some without a full drop, and double drops. It supports varied use within a set,
not a compulsory incoming/outgoing chain.
[UKF: Andy C, new year, new era](https://ukf.com/read/andy-c-new-year-new-era/).

**Limit:** Neither account supplies a complete timecoded annotation here. Do not turn the
six-minute description into exact interval endpoints or a rule about typical tease duration.
**Design consequence:** A play can have multiple contribution intervals. A shared drop has
explicit participants. A rewind is an annotation; separately authored intervals describe any
withdrawal and return. Supports D01, D02, D04.

### F02: Mix time and source position describe different things

DJ Storm discusses old-school selections across eras and allowing for rewinds when changing
speed. This is qualitative evidence that a performance need not follow a single uninterrupted
source-time progression.
[Red Bull Music Academy: DJ Storm lecture](https://www.redbullmusicacademy.com/lectures/dj-storm-lecture/).

Raveform's dataset documentation records mix-time and track-time positions separately, together
with alignment and structural information.
[Raveform dataset](https://mir-aidj.github.io/raveform/).

**Limit:** Neither source supplies a universal formula for source position. A source loop or
scratch can occur while a play remains continuously credited. Multiple contribution intervals
are not a substitute for a source transport map.
**Design consequence:** Mix time is canonical. Source positions, if introduced later, need a
separate relation that can express jumps, loops, reverse motion, and unknown spans. Supports
D02, D08, D09.

### F03: Deck capacity, cueing, and audible participation are distinct

Calyx & TeeBee distinguish recording FABRICLIVE 76 on three CDJs from their six-deck live setup.
They describe two individual mixers feeding a central mixer, and independently cueing the same
tune before one brings it in. This directly supports separating cueing from participation.
[Kmag: Calyx & TeeBee interview, 16 July 2014](https://kmag.co.uk/calyx-teebee-interview/).

**Limit:** Six available decks do not demonstrate six, or even three, simultaneously audible
tracks at a particular moment. The report's setup description must not become an annotated
layer count. It also does not establish a maximum deck count for the model.
**Design consequence:** Optional deck IDs have no fixed enumeration. A play is not identified
by a deck, and contribution data is not an occupancy log. Supports D01, D05.

### F04: One recording can have independently manipulated copies

Serato's Instant Doubles documentation describes copying the same recording to another virtual
deck at the matching source playhead, then manipulating the copies independently, including
beat-juggling operations.
[Serato: How does instant doubles work?](https://support.serato.com/hc/en-us/articles/202538250-How-does-instant-doubles-work).

**Limit:** Matching source position does not mean matching mix-entry time. A second copy can
enter later. Identical metadata alone does not establish whether two unidentified recordings
are the same material.
**Design consequence:** Separate recording IDs and play IDs. Copying, stopping, or annotating
one play must not change the other. Supports D01.

### F05: A credited recording need not contribute its full arrangement

Serato documents independent control of vocals, bass, melody, and drums through Stems.
[Serato: Stems overview](https://support.serato.com/hc/en-us/articles/5700968326927-Stems-Overview).

**Limit:** This establishes the capability. It does not mean Setcast has the separated audio,
knows which parts were used, or can measure their individual levels from the stereo master.
**Design consequence:** Optional component labels can describe participation. Omitted component
information remains unspecified. Do not create fictional per-deck or per-stem meters. Supports
D02, D05, D09.

### F06: A mixing technique is not necessarily a track boundary

Native Instruments describes fades, cuts, single-phrase beatmatching, bass swaps, and filter
fades as different transition techniques. In the bass-swap example, changing the low-frequency
balance is distinct from stopping a track.
[Native Instruments: five basic DJ transitions](https://blog.native-instruments.com/dj-transitions/).

Jeff Mills describes using a third turntable to sustain continuous mixing and fit more material
into a shorter period. This broadens the evidence beyond drum and bass without making a drop
mandatory at every track change.
[Ransom Note: Jeff Mills interview](https://www.theransomnote.com/music/interviews/jeff-mills-talks/).

**Limit:** These sources are not a complete genre-neutral ontology. Techniques combine and
terminology varies. There is no evidence that every set decomposes into pairwise transitions.
**Design consequence:** Intervals establish participation; annotations describe moments and
passages independently. Tags can expand without new membership rules. Supports D02, D04.

### F07: Tracklist timestamps differ from transition boundaries

The 2020 computational study analyzes 1,557 matched mixes, 13,728 unique recordings, 24,202
played-track instances, and 20,765 transitions. It compares human tracklist boundaries with
several estimated transition cue positions. The dataset is predominantly house and trance.
[Kim et al.: A Computational Analysis of Real-World DJ Mixes, sections 2, 4, and 5](https://arxiv.org/html/2008.10267v1).

**Limit:** These estimates are not exact universal acoustic boundaries, and the dataset is not
a representative measurement of jungle mixing. The paper's cue-in/cue-out terminology should
not be silently substituted for Setcast's participation semantics.
**Design consequence:** Navigation timestamps and participation boundaries need separate fields.
Refining an entrance should not silently move a published chapter. Supports D03.

### F08: Population statistics do not justify destructive timing defaults

The same study reports 86.1% of estimated tempo adjustments below 5%. Of 24,202 played-track
instances, 2.5% were estimated as transposed; **94.3% of that transposed subset** shifted by one
semitone. It also reports peaks in transition lengths at 32-beat multiples.
[Kim et al., sections 6.1–6.3](https://arxiv.org/html/2008.10267v1).

**Limit:** The one-semitone denominator in I03 is wrong. Small aggregate tempo differences do
not establish constant tempo within each performance, linear source playback, or known pitch
lock. Phrase clustering does not authorize moving an authored timestamp. In 4/4, 32 beats are
eight bars; without a meter there is no general beat-to-bar conversion.
**Design consequence:** No implicit beat snapping, phrase snapping, source-speed bounds, or
pitch-lock assumption. Future suggestions must remain inspectable and explicitly accepted.
Supports D08, D09.

### F09: Generator rules are not universal laws of DJ performance

The 2018 automated drum and bass system implements double-drop, rolling, and relaxed transition
patterns with selected structural alignments and transition constraints.
[Van Veire and De Bie: From raw audio to a seamless mix](https://link.springer.com/article/10.1186/s13636-018-0134-8).

**Limit:** Its chosen measure counts and restrictions define that generator. They do not prove
human DJs always use those counts or prohibit other combinations. Setcast describes an existing
mix; it is not implementing this automated mixing system.
**Design consequence:** Keep useful vocabulary, but do not make a fixed transition catalog or
phrase grid the foundation of the data model. Supports D04, D08.

### F10: Effect tails are a valid capability, with unmeasured timing here

Native Instruments describes delay Freeze during a fade-out and reverb that produces a tail.
That documents a mechanism for material to continue through an effect during a transition.
[Native Instruments: DJ effects, Delay and Reverb sections](https://blog.native-instruments.com/best-dj-effects/).

**Limit:** This does not measure how frequently DJs reuse a deck while a tail persists. The
specific 1:00–1:10 tail and 1:02 deck-reuse times in I03 are an engineering scenario, not a
transcription. Whether a tail should receive a visible credit, and where that credit ends,
remains an author's judgment.
**Design consequence:** Allow an explicitly annotated tail beyond direct playback. Do not use
contributions to enforce exclusive deck occupancy or assert default direct routing. Supports
D02, D05.

### F11: An existing Setcast demo already needs overlapping credits

The local, gitignored `demos/stakka-skynet/` example contains timings for an excerpt of the
Stakka & Skynet Knowledge Magazine mix, April 2001. Its referenced recording is
[the uploaded set](https://www.youtube.com/watch?v=Nk_g9sGIBUY). The excerpt spans original
14:03–19:34, with 0:00 in the excerpt equal to 14:03 in the uploaded set.

The durable transcription of the existing local annotation is:

- 0 seconds: Kemal & Rob Data, *Star Trails*, alone.
- 14 seconds: Stakka & Skynet, *Pathogen*, begins blending.
- 25 seconds: both described as fully blended.
- 72 seconds: *Star Trails* begins fading.
- 91 seconds: *Pathogen* alone.
- 200 seconds: Stakka & Skynet, *Clockwork*, begins blending.
- 211 seconds: both described as fully blended.
- 244 seconds: *Clockwork* alone.
- 331 seconds: excerpt ends.

**Derived fixture:** credit intervals `[0,91)`, `[14,244)`, `[200,331)` imply overlaps of
77 seconds and 44 seconds. Intermediate full-blend and fade points can be technique annotations;
they need not split participation intervals.

**Limit:** These are inherited project annotations, not measurements newly verified against
the audio in this review. Deck A/B labels in that example are not independently verified
hardware facts. The source link alone does not verify the local timestamps. Preserve this
qualification when promoting the fixture into a shipped demo. Supports D02, D03, D08.

## GPT Pro findings and dispositions

The following identifiers refer to I02 section B's seven findings. They are design analysis,
not additional empirical evidence.

### G01: Adding an overlay must not remove another play

The previous proposal ended a fallback play at the next row's first contribution. Inserting
a tease at 1:00–1:08 between listings at 0:00 and 3:00 therefore removed nearly two minutes of
Foundation's credits. **Accepted:** only listings delimit fallback intervals. Explicit
contributions can coexist with a listing; adding an unlisted overlay changes no other row.
D03 addresses this directly.

### G02: Zero-length intervals and same-time events need explicit rules

The old legacy-tie rule could create `[0,0)` and then process a close before its open, leaving
a ghost active play. **Accepted:** normalized intervals always have positive duration. With
compatibility waived, tied listings now form a concurrent group ending at the next distinct
listing, instead of preserving an old single-track winner. D08 replaces the legacy exception.

### G03: Play identity is not a physical loading session

Static deck assignment and load/unload-based identity cannot describe transfers or unknown
hardware history honestly. **Accepted:** the author groups an appearance; independently
manipulated copies are separate. Deck association belongs to contribution intervals. D01/D05.

### G04: The proposed language overstated knowledge

`audible` plus default `via: direct` suggested acoustic and routing knowledge that imported
tracklists do not provide. **Accepted:** use credited `contributions`, preserve mechanical
boundary origins, and make `tail: true` an explicit positive assertion. Omission means unknown,
not direct. Quantitative confidence is deferred until a calibrated producer exists. D02/D05.

### G05: Scope and simultaneous section changes were underspecified

Singular `play` versus plural `plays` hid a change in meaning; ordering could conceal conflicting
annotations. **Accepted:** explicit scope, separate participants for mix cues, a defined shared
drop propagation rule, conflict rejection, and local section reset only on genuine gaps. D04/D08.

### G06: Tags, segmentation, and focus had hidden behavioral coupling

A `tease` tag affected focus and chapters, and adjacent metadata intervals could be mistaken for
new entrances. **Accepted:** tags are descriptive, chapters follow listings, contribution runs
absorb adjacent metadata boundaries, and pins expire per selected run without resurrecting on
return. D02/D03/D06. Automatic focus remains a presentation heuristic, not a musical fact.

### G07: Open intervals do not encode unknown coverage or historical knowledge

A null end cannot distinguish ongoing contribution, interrupted capture, and unknown coverage.
A later corrected timeline also cannot reconstruct what a live display knew before a correction
arrived. **Accepted:** finite offline snapshots, explicit future capture reconciliation, and a
narrow reproducibility promise. D09. No live capture schema is presented as finished.

I02 favored boundary events as canonical partly to preserve the existing architecture. The
current design chooses normalized intervals plus annotations and a derived event index instead.
That is a deliberate departure now that compatibility is waived, not an unaddressed finding.

## Deep Research findings and dispositions

I03's useful contribution is breadth: overlaps, copies, shared drops, techniques, stems,
uncertainty, and future hybrid inputs. Its recommendations require the following corrections:

- **Accept with sourced support:** concurrency, repeated appearances, independent copies,
  synchronized drops, optional component metadata, and unknown deck state. F01–F06 support
  these distinctions; no exact three-track transcription is claimed.
- **Narrow the deck claim:** six-deck capacity is documented; continuous layering of a particular
  number of audible tracks is not established by that setup. F03.
- **Reject timing defaults:** do not infer linear source time, constant beatmatching, pitch lock,
  or automatic phrase alignment from aggregate statistics. Correct the key-shift denominator
  and beat/bar arithmetic. F08.
- **Reject membership from moment labels:** a double drop should identify participating plays,
  not invent overlapping intervals. Ordinary blends do not require a double-drop annotation.
- **Retain tails as a capability and fixture:** F10 supplies a direct mechanism source. The
  report's duration and immediate deck-reuse scenario remain illustrative, with no frequency
  estimate. Tail participation overlapping a new play is still overlap.
- **Reject source-position assumptions:** loops, scratches, and partial source playback do not
  inherently require extra plays or contribution gaps. A continuous credit interval says
  nothing about continuous forward source transport. F02/F04.
- **Correct the instant-double example:** copies can enter at different mix times with matching
  source positions. Rewinding only one copy does not make both copies synchronize at the earlier
  point without another operation. Keep the independent-copy requirement, not that causal story.
- **Keep scenario sketches as synthetic tests:** the report does not substantiate the exact
  timings of its triple-deck, loop, double-drop, rewind, or tail examples. A 16-bar duration also
  requires tempo and meter before it can be translated to seconds.
- **Defer hybrid-input and detailed transport schemas:** the questions are useful, but the
  report does not establish a complete contract for microphones, live instruments, clocks,
  transport, or routing. Do not invent those fields as solved requirements. D09.

## Decision ledger

These are Setcast's engineering choices. Sources constrain what the model must express; they do
not prescribe YAML field names, IDs, reducers, focus defaults, or serialization.

### D01: Recording identity and play identity are separate

**Basis:** F01, F04, G03. **Decision:** reusable recording metadata, independently identified
plays, and author-controlled grouping of returns. Decks never supply play identity.
**Alternative rejected:** recording ID alone cannot distinguish simultaneous copies; a hardware
load lifecycle cannot be inferred from ordinary tracklists.

### D02: Contributions are explicit intervals of credited participation

**Basis:** F01, F02, F05, F11, G04, G06. **Decision:** half-open intervals, gaps and overlaps,
finite offline ends, and derived uninterrupted runs. **Alternative rejected:** one current
track, or a sample-level audibility threshold presented as ground truth. A credited interval
is expressive enough for visuals without requiring an audio reconstruction engine.

### D03: Listings and participation have independent authority

**Basis:** F07, G01, G06. **Decision:** `at` creates a listing and supplies a documented fallback;
`until` refines its end; explicit `contributions` replaces fallback timing while preserving
`at`. Unlisted overlays never truncate other rows. **Alternative rejected:** deriving chapters
from first contribution, or ending a track at every new layer. A split simple/rich input format
would make incremental refinement more disruptive than one progressively detailed row.

### D04: Annotations describe music; intervals establish participation

**Basis:** F01, F06, F09, G05. **Decision:** moments and optional spans, explicit scope,
participant-bearing shared drops, and extensible descriptive tags. **Alternative rejected:**
a closed enum of every transition technique, a mandatory transition graph, or musical markers
with implicit membership side effects. Double drops compose existing concepts instead of
requiring a separate participation state.

### D05: Decks and mechanisms are optional temporal information

**Basis:** F03–F05, F10, G03/G04. **Decision:** arbitrary deck labels on intervals, positive
`tail: true`, optional parts, no fake alternating decks or per-deck master-audio meters.
**Alternative rejected:** permanent `Play.deck`, exclusive occupancy constraints on credits,
and default direct routing. Fine-grained hardware state can be added separately later.

### D06: Presentation is a projection of one model

**Basis:** user's playlist/DJ question, G06, and the model's multiple current plays.
**Decision:** `auto`, `playlist`, and `dj` presentation; automatic focus plus explicit pins;
no mode-dependent timeline normalization. `auto` uses project-wide observed/authored overlap
in the normalized credits, not genre guessing. **Alternative rejected:** separate playlist/DJ
domain schemas, or tags silently controlling focus. The focus heuristic is a product choice
and can be revised after usability testing without rewriting contribution history.

### D07: Store intervals; derive the event index

**Basis:** authoring ergonomics, G02, and the explicit removal of compatibility constraints.
**Decision:** one normalized domain document with intervals and annotations. Generate event
boundaries and query indexes from it. **Alternative rejected:** independently editable intervals
and start/stop logs, or making authors pair low-level events to express every blend. Live
observations may be events; they still require reconciliation into a finalized document.

### D08: Define boundaries, precision, and conflicts without musical guessing

**Basis:** F02, F08, F09, G02, G05. **Decision:** mix-relative integer microseconds after one
normalization step; half-open intervals; grouped tied listings; explicit same-time conflict
errors; random-access equivalence. **Alternative rejected:** frame-number storage, floating-point
equality as an undocumented contract, hidden file-order winners, and automatic musical snapping.
Microseconds are an engineering precision choice, not a claim of annotation accuracy.

### D09: Build honest offline behavior before detailed capture or reconstruction

**Basis:** F02/F05/F08, G07, and the app's current mixed-audio rendering scope. **Decision:**
finite reconciled documents and reproducibility relative to a document revision and rendering
inputs. **Alternative rejected:** treating unknown capture as continuous participation to EOF,
a complete mixer simulator, and a claim that the final event history alone reproduces the live
screen. Source transport, live inputs, and receipt-time replay remain separate future designs.

## What this evidence does not yet establish

There is enough evidence to reject the one-current-track abstraction and to justify the core
identity and interval distinctions. There is not a representative, independently annotated
cross-genre benchmark here. In particular, this record supplies no measured distribution of
layer counts, tease duration, tail duration, or preferred viewer focus.

Before tuning defaults from purported DJ practice, annotate a small permission-appropriate
corpus with explicit source references and uncertainty: a jungle/D&B tease and reload passage,
a long house blend, a techno layering passage, and a turntablism example with independent
copies. Preserve both annotation disagreements and source/version uncertainty. Validate visual
readability with DJs separately from whether the schema can encode the performance.

Those studies can refine presentation defaults and importer assistance. They are not grounds
for silently filling unknown hardware, source transport, or musical boundaries in the present
model. Update this evidence ledger when new observations change a decision; keep the distinction
between source facts, derived requirements, and product choices explicit.
