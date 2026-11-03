# Explicit visualizer package qualification, 3 November 2026

The stock CLI now loads explicit installed visualizer packages across Node validation and browser
rendering. The API/version, schema, media, scene and cache contracts are documented in
[visualizer-plugins.md](../../visualizer-plugins.md). The implementation record and scope are in
[the plan](../../visualizer-plugins-plan.md).

## Results

- Baseline: 694 tests, formatting, lint/types, required dependency isolation and decoded smoke pass.
- A fresh browser-only tarball installation contains no Remotion packages and passes existing CLI
  workflows plus a separately packed visualizer package.
- A fresh optional-Remotion installation passes the same browser workflows and renders the external
  visualizer through Remotion, verifying decoded green marker and blue media pixels.
- The installed fixture checks both configuration validation modes and project-aware schema output;
  portrait output; exact decoded equality for one/two workers; identical cached exports with no
  new captures; resume-mode export; plain and plugin projects in one render session; exact preview
  seeks; recorded playback; synthetic live capture advancing the plugin frame; saved media and
  recorded scene exports. This is not physical audio-device or long-duration plugin qualification.
- Both complete exporter acceptance suites pass, including readiness, looped video, source timing,
  GPU workers/chunks, injected failure recovery, cancellation and destination preservation.

`source-identity.json` records runtime/script/dependency hashes before commit. The browser-only
report precedes a renderer-neutral helper rename needed by the Remotion entry; the generated
browser registration source is unchanged, and the later compatibility installation repeats every
browser plugin check. Final baseline validation follows the complete integration.

## Failures retained and corrected

The first browser installation reaches the plugin check but cannot resolve a relative Vite
library entry. The loader now intercepts an absolute synthetic entry path. The next attempt passes
export/caching checks but fails in the test harness's CommonJS Playwright import. The corrected
harness loads Playwright through the installed renderer's require context.

The first optional-Remotion installation passes ordinary Remotion and all browser plugin checks,
then rejects the generated entry because it does not directly call registerRoot. Remotion and
Studio require that entry contract. The adapter now generates an explicit registerRoot call after
plugin registration; no upstream check is disabled. Its repeated installation passes.

The initial reports and logs are retained beside the successful reports. Large media and temporary
installations are not committed. No packages were published and nothing was pushed. Linux/Windows
plugin qualification, arbitrary third-party code, physical live devices and Studio UI interactions
are not established by these checks. The existing first-export performance objective remains open.
