# Configuration tooling plan

## Purpose

Treat authored configuration as a platform interface. Editors and external tools need discoverable
field types, defaults and visualizer choices. Automation needs an explicit project-validation
command that does not launch a renderer. Derive this information from the schemas and loaders
already used at runtime; do not introduce a second configuration model.

## Scope

1. Export input JSON Schemas for recorded and live project configuration and reusable setup
   documents. Generate them from the installed core version and registered visualizer schemas.
   Preserve strict unknown-key checks and authoring defaults. Include descriptions/examples where
   they clarify a decision. Document that JSON Schema cannot express every semantic or asset check.
2. Add `setcast schema` for machine-readable schema output, with no browser, media probing or
   network dependency. Support local editor association instead of inventing a hosted schema URL.
3. Add `setcast validate` for recorded/live project loading, with structured diagnostics for
   automation and readable terminal results. Reuse the authoritative loaders, including finite
   timeline and asset validation. Do not decode whole-set envelopes or start a server.
4. Document editor setup, command contracts, validation boundaries and plugin registration limits.
   Verify generated schemas against real authoring examples and negative fixtures, installed
   commands and the existing configuration/runtime tests. Commit coherent pieces separately.

## Decisions to resolve

- JSON Schema describes input before timecode and shorthand normalization. Runtime refinements,
  cross-reference checks, file containment, decoder support and hardware availability remain
  authoritative outside JSON Schema.
- Export every registered visualizer's schema, including its discriminator. Avoid hard-coding a
  second list. Omitted visualizer name follows the existing spectrum default only.
- Keep schema generation isomorphic in core; filesystem validation belongs to core/node and CLI.
- Prefer standard draft-2020-12 documents generated locally. No external publishing or automatic
  config-file edits are part of this work.
- Keep file diagnostics stable and distinguish warnings from errors. Validation success must not
  imply physical mixer, graphics-driver or camera qualification.

## Session constraints

Started after GPU recovery was committed on 2026-10-23. A two-hour 1080p endurance workload runs
from f4b8ec4 in parallel, expected to finish around 17:35 Warsaw. Stop starting features at 18:00
and reserve the remaining window for verification, documentation, commits and the 19:00 handoff.

## Progress

- Schema generation and CLI implemented for project/live/visualizer/venue/test-pattern inputs.
  Independent Ajv checks compile all kinds and accept repository examples; negative cases cover
  strict keys, renderer settings and visualizer dispatch. Timecode semantics remain a runtime
  check, explicitly tested and documented. CLI works outside projects with clean JSON stdout.
- Validation command is the next standalone piece. No runtime plugin loader is added.
- Schema milestone validation completed: ready 531 tests, independent schema/CLI checks and
  installed-package smoke passed. Public docs and agent guide describe semantic limits.
- Validation API and CLI implemented. Reports preserve authored paths, loader issue paths and
  warnings, check direct scene references, and distinguish usage/configuration/runtime exits.
  Recorded scene errors now retain their preset filename. Ready passed 541 tests; installed-package
  smoke and validation of all seven source example configurations passed.
