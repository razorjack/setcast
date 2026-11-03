# Explicit visualizer packages

Implementation is complete on macOS, 3 November 2026. Final acceptance evidence is recorded below.
Work started after browser-first promotion. The user authorized completion
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

- The baseline now passes 693 tests, dependency isolation and decoded smoke. The first fresh
  browser-only installation reaches the plugin check after passing existing workflows, then
  rejects Vite's relative virtual entry identifier. Vite resolves library entry paths against its
  package root; the generated entry now uses an absolute synthetic path intercepted by the loader.
  The failed installation report is retained. Full installed qualification is still in progress.

- After the entry fix, the installed browser plugin passes decoded marker/asset checks, identical
  cache reuse, resume mode and mixed plugin/no-plugin session bundles. The harness then finds a
  CommonJS Playwright import mismatch before preview checks. The harness now loads Playwright
  through the installed renderer's require context. No product workaround is needed.
- Saved scenes now include a package manifest with exact plugin versions alongside copied media.
  Dependencies are not installed or copied automatically.

- Final browser-only installation passes, including portrait output, exact one/two-worker video,
  preview seek order and a live capture clock driven by synthetic audio. The first compatibility
  installation then rejects a generated entry without an explicit Remotion `registerRoot` call.
  Remotion checks the entry text before bundling, and Studio does not allow ignoring that check.
  The adapter now owns a generated composition entry that registers plugins and calls registerRoot;
  core only generates renderer-neutral plugin registrations. No validation check is bypassed.

## Completed implementation

- Explicit installed package loading works for recorded and live projects, with API-version and
  schema checks, isolated Node catalogs and generated renderer registrations.
- Declared media is checked before rendering, copied and rebased with saved scenes, and included
  in cache/resume identity. Saved scenes record exact plugin dependency versions in package.json.
- Bundles are scoped to the package set and content identity. Preview/live reject scenes requiring
  a different package set instead of using stale component code. Plugin code changes require restart.
- Authoring documentation and `schema --project` explain the contract. Existing embedding hosts
  can still register visualizers directly. One visualizer per package and top-level media fields
  are deliberate initial limits; automatic discovery and installation are not implemented.
- The baseline passes 694 tests, lint/types, dependency isolation and decoded smoke. Final installed
  browser-only and optional-Remotion checks pass. The installed fixture verifies decoded marker
  and asset pixels, exact worker equality, portrait output, repeat cache reuse, resume mode,
  mixed render-session bundles, preview seeks, recorded playback, synthetic live capture and
  saved/recorded scenes. Browser-only installation contains no Remotion packages.
- Both exporter acceptance suites pass. The retained [qualification report](research/visualizer-plugins-2026-11-03/README.md) includes successful checks and corrected failures. This is macOS software qualification;
  it does not qualify physical audio devices, other platforms or arbitrary third-party packages.

The readback investigation was committed separately as `aeba45e`. This feature is a product
extension, not evidence that the first-export speed target has been achieved.
