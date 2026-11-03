# Explicit visualizer packages

Work started on 3 November 2026 after browser-first promotion. The user authorized completion
of the direct readback experiment, followed by external visualizer loading. Findings and
validation are recorded here as they occur.

## Contract and implementation sequence

The first implementation loads explicitly listed, already installed npm packages through
`plugins:` in recorded and live configuration. It does not discover packages or install them.
A package exposes an isomorphic `/setcast` definition with API version 1 and one visualizer
schema, plus a `/setcast/browser` default React component. Setcast registers the component in
a generated bundle entry before starting the existing renderer/player entry. The package
uses Setcast and React as peers. Schema loading must not import React or a renderer.

Node validation uses a project-specific visualizer catalog. Loading one project's plugin must
not make that visualizer silently available to another project. Resolved projects retain
package identity and declared asset fields. Plugin config asset fields are explicit top-level
optional file paths; loaders validate them, saved scenes copy them, scene rebasing adjusts them,
and export fingerprints track them. Bundled package assets must be embedded in the component.
Arbitrary undeclared runtime fetches remain outside the supported resumable resource contract.

Browser bundles include plugins for root and recorded scenes. A live session loads its explicit
root plugin set; recalled scenes must use compatible packages from that set. Adding or changing
plugin code requires restarting preview/live. This avoids silently serving stale JavaScript.
Identical successful exports may reuse cached work, but arbitrary plugins cannot use the
built-in announcement-only incremental dependency optimization.

Validation covers missing/invalid packages, duplicate names, API incompatibility, configuration
errors, project isolation, declared assets, saved scenes, bundle identity and installed-package
execution through both exporters, independent preview and live output. No external publication
is part of this work.

## Observations

- The existing registries support schema/component registration, but Node uses a process-global
  registry. It needs a scoped catalog for configured plugins.
- Browser render sessions currently cache one bundle for every project. Plugin-aware sessions
  need a bundle key that includes the loaded package set and content identity.
- Saved scenes already copy built-in assets and inline theme CSS. External visualizer assets
  need the same treatment; retaining package names alone would lose those assets on relocation.
- The readback timing retry again stopped before rendering because CPU load exceeded the
  existing 15% pre-run limit. A separate correctness-only export pair is running under observed
  load. Its timings will not be used to qualify performance.

- The readback experiment is now rejected as a general substitution: partial-alpha pixels differ.
  The production opaque CanvasSink policy stays unchanged. See the retained
  [follow-up report](research/readback-followup-2026-11-03/README.md).
- Initial plugin loader tests pass for project isolation, missing/incompatible packages, duplicate
  names, saved/rebased media and running-bundle compatibility. Full integration is still in progress.
