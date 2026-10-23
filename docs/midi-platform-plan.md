# Portable MIDI mapping plan

## Purpose and scope

Controller mappings are output-session setup. Make them reusable across projects, browsers and
machines through a core contract, live.yaml defaults and a versioned portable JSON profile.
Keep the current actions and effective-action journaling; do not introduce raw MIDI replay,
hardware discovery services, OSC, clock following or device-specific drivers in this piece.

## Contract

- Move channel-message decoding, finite action names, mapping keys and default mappings to core.
  Validate canonical keys, channels 1–16, controller/note numbers 0–127 and supported actions.
- `live.yaml midi` contains an optional profile name and an explicit mapping. A configured
  mapping wins at startup. Scene recall never replaces mappings, and saved scenes omit MIDI setup.
- A version 1 JSON profile contains name and mapping. Import validates the entire profile before
  changing anything; export preserves the current mapping. Empty mappings intentionally disable
  controller actions. No automatic MIDI permission request or device selection is introduced.
- With configured MIDI, edits/imports are session-only and can be exported. Without it, persist
  the versioned profile in browser storage and migrate valid existing raw mappings. Do not let a
  project's startup defaults overwrite the user's browser profile for unrelated projects.
- Mapping replacement clears pending continuous-control values and button-edge state so old
  mappings cannot dispatch delayed actions. Audio capture, scene identity and journal clocks remain
  unchanged. Existing effective performance/scene/branding actions still enter the journal.

## Operator design

Visual thesis: keep the scene dominant and add a compact transfer row inside the existing MIDI
section, using its current dark typography and accent.
Content plan: mapping source/name and count, connection/input/learning controls, import/export,
then a readable mapping list. Avoid new cards or an extra top-level setup panel.
Interaction thesis: learning state and validation notices provide immediate feedback; importing
changes only mappings; scene and audio motion remain controlled by their existing explicit clocks.
No decorative animation is needed for this utility.

## Verification

Core tests cover malformed messages, bounded mapping keys/actions, profile versions and migration.
Browser checks cover configured startup, import/export before connection, invalid-profile retention,
learning/reset, buffered-CC invalidation, popup operator use, capture continuity, scene isolation
and journaled effective actions. Run ready, existing performance/branding checks and package smoke.
Physical controllers and browser permission behavior remain separate hardware qualification.

## Session timing

Start around 16:02 Warsaw on 2026-10-23. Two-hour GPU qualification continues from f4b8ec4 until
about 17:35. Stop starting features at 18:00 and finish verification and handoff about 19:00.

## Completed

Implemented the core schemas/decoder/buffer, project startup configuration, browser migration,
versioned transfer and mapping list. The same keyboard-accessible file-selection control now
serves MIDI, camera settings and venue imports. The core buffer fixes delayed old-mapping values
after learning/import/reset. Documentation: [midi-controls.md](midi-controls.md).

Ready passed all 548 tests. The dedicated Chromium check passed, including keyboard file selection
in the output and popup operator, effective actions in journals and untouched unrelated browser
storage. Existing performance, branding, camera and projection checks passed. Operator screenshots
were inspected. Installed-package smoke passed with public MIDI exports and `setcast schema midi`.
