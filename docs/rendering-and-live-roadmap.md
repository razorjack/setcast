# Rendering and live performance roadmap

Current status reviewed 5 November 2026 against implementation through `011b44a`.
This is the authoritative list of remaining project work. Detailed plans define technical
contracts and reproduction commands; the [delivery history](rendering-and-live-history.md)
preserves completed milestones and earlier decisions. Historical instructions do not assign
new work. No dates or additional platform support are promised by this list.

## Product direction and current baseline

Setcast supports recorded DJ videos, filmed backdrops and direct projection from mixer audio.
Live and offline output share scene components, audio features and explicit time. Effective
operator actions must survive in a session journal so a separately recorded master can reproduce
the performance. Filmed backdrops favor restrained motion, controlled brightness and a quiet
region behind the performer; projection favors broad geometry and phrase-aligned changes.

Browser is the default exporter. Remotion is an optional compatibility adapter. The
[3 November promotion](research/browser-first-promotion-2026-11-03/README.md) explicitly allowed
pre-release promotion before the performance objective and all platform checks passed.
Promotion does not establish either result.

Resume, persistent reuse, automatic workers, hardware encoding, audible preview/export controls,
local H.264/ProRes/transparent PNG workflows, live performance controls, manual journal replay,
scene sequencing, MIDI mapping, one-projector setup, branding and configuration tooling are
implemented. [Explicit visualizer packages](visualizer-plugins-plan.md#completed-implementation)
are also implemented. These capabilities are the starting point, not outstanding milestones.
See [platform contracts](platform.md) and the
[renderer phase record](renderer-replacement-plan.md#delivery-sequence) for scope and evidence.

## Active priorities

Renderer performance and supported-platform qualification remain the current renderer priorities.
Necessary live correctness work continues independently. Product candidates below do not displace
these priorities without an explicit scope decision. The IDs identify work items, not deadlines.

### R1. Establish the first-export performance result

**Status:** objective unmet; further optimization is research, not a known implementation task.
The current macOS and eleven-case Linux matched-quality comparisons miss the 30% target.
Bitmap preparation improved Setcast's previous PNG path; that is not a speedup over Remotion.

**Next action:** profile current standard/GPU workloads, identify a measurable capture or scheduling
cost, and test one candidate against the retained regression corpus. Preserve rejection evidence
for native DOM capture, Electron bitmap capture, direct CDP modes and direct decoder readback.
None is an approved production substitution.

**Complete when:** the predefined core suite demonstrates at least 30% lower median wall time
than tuned current Remotion at matched quality, with workload-level spread, regressions, actual
runtime paths and resource/cleanup results retained. Run timing pairs in quiet conditions,
separately from validation. Revising the objective requires an explicit roadmap decision.

**Dependencies and evidence:** quiet representative machines and a qualified upstream comparison
configuration. Follow the [benchmark contract](renderer-replacement-plan.md#phase-0-establish-a-fair-benchmark),
[macOS comparison](research/current-upstream-2026-11-01/README.md),
[Linux results](research/linux-qualification-2026-11-01/README.md) and
[readback rejection](research/readback-followup-2026-11-03/README.md).

### R2. Complete exporter qualification on supported platforms

**Status:** local macOS workflows and substantial Fedora software/NVENC checks pass. The promoted
Quicksilver repair fails Linux compact and HD repeated-video checks. Full Linux real-master
resources remain unchecked, and Windows remains unqualified. Explicit NVIDIA ANGLE failed
correctness/capture checks. Current Linux fresh browser-only and optional-Remotion installations
pass, including installed external visualizers. Focused Quicksilver worker assertions also fail
through pinned Remotion on the unchanged baseline and the clipping candidate; general exporter
acceptance does not qualify those cases.

**Next action:** repair the [Linux Quicksilver video regression](research/quicksilver-linux-2026-11-05/README.md)
without restoring the known macOS image-layer defect. The isolated
[clipping-container candidate](research/quicksilver-clipping-2026-11-05/README.md) is promising;
review its removed portrait color rim and direct-child CSS migration, and complete macOS
repetition before promotion. Repeat the
[focused handoff](linux-renderer-qualification.md#required-follow-up-for-the-promoted-quicksilver-repair)
on both platforms after a shared layer change. Then complete available real-master resource checks
and obtain a Windows host. Include installed plugin workflows in each new platform qualification.

**Complete when:** each advertised OS/backend has revision-linked fresh browser-only installation,
optional-Remotion compatibility, theme/CSS, audio/video/readiness, cancellation, failure cleanup,
resume/cache and sustained export evidence. Reports identify actual graphics/encoder paths and
process-tree resource limits. Prepared CI jobs do not count as executed checks. Keep unqualified
backends explicit; software or short NVENC passes do not qualify every driver or workload.

**Dependencies and evidence:** platform access, legally usable long master assets and host-level
resource visibility. Use the [Linux evidence](research/linux-qualification-2026-11-01/README.md),
[macOS repair evidence](research/quicksilver-repair-2026-11-03/README.md) and
[installed plugin checks](research/visualizer-plugins-2026-11-03/README.md).
The newer Remotion shared-memory cleanup failure remains relevant to comparison upgrades; the
optional production adapter stays pinned to 4.0.513 until a separate qualified change.

### R3. Resolve sustained live software-rendering sample loss

**Status:** an isolated software preset still drops analysis samples near scene changes. The
one-hour recovery preset passes and does not qualify the failing preset. Diagnostics observe an
approximately 875 ms packet-delivery gap beyond the 512 ms queue budget; its browser cause is unresolved.

**Next action:** profile scheduling, drawing and context creation/disposal around the
Constellation-to-Field transition. Isolate scene composition, operator placement and concurrent
load. Evaluate bounded resource reuse or worker ownership only when measurements support it.

**Complete when:** a demonstrated correction passes the unchanged full 90-minute software preset
with zero dropped analysis samples, bounded resources and valid journals. Repeat relevant scene,
recovery and restart checks. Keep queue bounds and failure assertions unchanged; an instrumented,
shortened or different passing workload cannot replace the original reproducer.

**Dependencies and evidence:** a reproducible software-rendering environment. Start with the
[Linux failure report](research/linux-qualification-2026-11-01/live-qualification.md) and
[profiling plan](software-qualification-plan.md#follow-up-investigation). This is separate from
offline correctness and R1's throughput objective.

### R4. Qualify physical live and receiving-application workflows

**Status:** synthetic browser checks exist; physical mixer/interface, MIDI, OBS, camera and
projector behavior remains unqualified. Local decoded/native ProRes checks do not qualify every
editor or a long export.

**Next action:** select equipment and receiving applications, then run the existing one-to-two-hour
live checklist with scene changes, disconnect/reconnect and capture restarts. Measure A/V offset,
drift, rendered updates, dropped samples and process memory. Check MIDI permissions/ownership,
projector geometry, and camera banding, exposure and legibility.

**Complete when:** each claimed workflow has a reproducible report naming equipment, runtime,
settings, duration, measured timing and recovery results. Qualify long ProRes and intended
editor/OBS alpha/color handling separately. Define acceptable measured latency for the intended
setup before claiming it suitable; synthetic timing is not a physical measurement.

**Dependencies and evidence:** equipment and application access. Use the
[hardware checklist](player-development-plan.md#remaining-hardware-qualification),
[camera setup](camera-setup.md), [projector setup](projector-setup.md),
[compositing contract](compositing-output.md) and [endurance tooling](endurance.md).

## Product candidates

These items need explicit selection before implementation. Their order retains the existing
product-candidate sequence after removing completed plugin loading. Scope and acceptance below
make a selected item reviewable; they do not authorize every transport or extension mentioned.

### P1. Portable scene collections

**Status:** self-contained saved-scene directories exist; collection manifests and archive transfer do not.

**Next action:** define a versioned collection manifest and one export/import workflow containing
scene names, previews, energy tags, artwork/fonts and declared plugin dependencies.

**Complete when:** a collection round-trips into a fresh project with its appearance and assets
intact; invalid paths, missing/incompatible dependencies and collisions fail before partial import.
Recall preserves venue geometry, device routing, MIDI setup and active performance state.
Plugin dependency installation remains explicit.

**Dependencies and evidence:** build on [scene persistence](platform.md#keep-appearance-setup-and-performance-distinct)
and the [visualizer package contract](visualizer-plugins.md), including saved dependency versions.

### P2. One concrete live metadata adapter

**Status:** manual journals and finite replay exist; hardware deck occupancy and metadata protocol
adapters do not. MIDI performance controls are not a track-metadata integration.

**Next action:** choose one transport and obtain a reproducible captured fixture. Define its
consumer before designing a broader adapter framework. Map observations to capture time with
source identity and timing uncertainty, and handle reconnects and duplicate observations.

**Complete when:** fixtures and the physical source produce correct credits/annotations and
replayable journal records across reconnects and timing offsets. Replay with a separately recorded
master preserves accepted effective actions. Measure clock drift and define correction where
needed. Resolve or explicitly retain current nondefault capture-sensitivity/visual-delay replay
restrictions before claiming that workflow supported.

**Dependencies and evidence:** one source protocol/device and legal fixtures. Use the
[journal and replay contract](live-input.md) and [finite mix model](dj-mix-model.md).

### P3. Improve beat tracking with labeled real music

**Status:** assisted estimates, explicit adoption and evaluation tooling exist. Offbeat/metrical
ambiguity remains unresolved; unlabeled recordings establish coverage, not accuracy.

**Next action:** obtain legally usable labeled passages spanning four-floor, breaks, half-time,
offbeat accents and tempo changes. Compare onset candidates with the shared evidence tracker.

**Complete when:** a retained evaluation separates tempo, metrical level, phase, coverage and false
confident locks, and supports a stated detector decision. Any promoted change must pass live
adoption, confidence-loss, restart and journal checks. Continuous following and downbeat inference
need separate acceptance decisions; manual BPM/tap/downbeat and explicit adoption remain authoritative.

**Dependencies and evidence:** independently checked labels and representative recordings. Follow
[beat evaluation](beat-evaluation.md) and the [live tracker contract](live-beat-tracking.md).

## Deferred scope and open decisions

- More GPU effects need explicit resource budgets and recovery checks. Stateful particles need
  deterministic replay or checkpoints before arbitrary seeks and independent export workers.
- Curved projection, color matching and multi-projector blending follow physical one-projector
  qualification; each needs a separate geometry/calibration/overlap contract.
- Additional history importers, metadata transports, generative backgrounds and plugin kinds
  beyond explicit visualizers need concrete consumers and selected scope.
- Native multichannel capture, OBS browser-source integration beyond window capture and live
  annotation presentation remain separate designs. Direct broadcasting is not implemented.
- An AudioFeatures sidecar needs measured decode/reuse benefit before choosing a format. Existing
  bounded PCM and preparation caches do not require it.
- VP9 alpha, cross-machine caches and long-master contiguous chunk scheduling are separate
  renderer follow-ups. Removing optional Remotion compatibility requires its own decision.

## Updating this roadmap

Keep current status here and link the producing revision and retained report for any completion
claim. Record detailed measurements and failed experiments in the relevant evidence documents.
When an item completes, remove it from active work and add a concise entry to the delivery history
with its evidence and remaining limits. Do not append test counts, session deadlines or completed
implementation narratives to the active backlog.

Validate selected changes with the repository workflow in `AGENTS.md`: `vp run ready`, both
exporter acceptance suites for shared rendering/readiness changes, and relevant browser,
installed-package or device checks. Preserve exact frame/audio, resource and failure assertions.
Qualification claims apply only to the tested configuration; completing one item does not
implicitly complete another.
