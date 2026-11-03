# Browser-first promotion, 3 November 2026

The browser renderer becomes Setcast's default, and the CLI no longer requires any Remotion
package. Explicit Remotion rendering and Studio remain available through the optional adapter.
Quicksilver's parent-layer repair is included. Nothing is pushed, published or deployed by this
local migration.

The user explicitly authorized pre-release promotion without waiting for unreachable Linux or
unavailable Windows machines. Setcast has no users yet, and Remotion was a prototype dependency.
Platform evidence and first-export performance continue as follow-up objectives. This decision
does not establish a speed advantage or qualify an untested platform/backend.

The integration combines repair `97d271a` with browser-first branch `4a5af1b`. The repair's
macOS validation is in [the preceding report](../quicksilver-repair-2026-11-03/candidate.md).
`source-identity.json` hashes the actual runtime, scripts and dependency files checked before
commit. Documentation changes do not alter the qualified runtime.

## Integrated validation

Frozen dependency installation and `ready` pass. The latter covers all 688 tests, formatting,
lint/types, required dependency isolation and decoded smoke. Both fresh tarball installations
pass on macOS arm64:

- `installed-browser.json` records a physical package inventory with no Remotion packages. It
  checks default validation, preview, clips, bundled output, all themes, video, cache/resume,
  preview exports, ProRes and diagnostics.
- `installed-compatibility.json` additionally installs the optional adapter, validates explicit
  Remotion selection and renders six decoded frames.

The renderer/theme implementation also passes both exporter acceptance suites, compact and HD
Quicksilver video workers, static workers, background source transitions and all 64 video seek/fit
cases, as retained in the repair report. These successful fixtures do not qualify Linux's new
parent-layer policy, Windows, every editor, physical live hardware or a full Linux real master.
The CI matrix is prepared locally; hosted runs have not been initiated.

## Performance experiments and remaining work

The prior complete Linux matched-quality study misses the original speed objective in every
workload. No performance criterion is silently marked complete by this migration. Native DOM,
Electron bitmap and direct CDP transport experiments remain rejected for their documented
correctness or throughput outcomes.

Two Quicksilver layer-cost attempts stop before capture while the host stays above the existing
15% CPU-busy threshold. A separate direct decoder-canvas readback probe preserves exact RGBA on
180 shuffled opaque samples, but its complete-export experiment also cannot start under load.
The readback prototype is not promoted. Its two initial launcher errors, corrected pixel report,
load failure and reproduction code are retained in `readback-experiment/`. Source restoration
leaves production's qualified copied-canvas preparation unchanged. No other project's processes
were stopped. The narrow readback result does not establish alpha, complete-export or resource
qualification, and no faster-export claim follows from it.

The active [Linux handoff](../../linux-renderer-qualification.md) begins with the promoted repair's
exact commands. Outstanding work is Linux repair repetition and full-master resources, Windows,
first-export optimization, the separate Linux live dropped-sample failure, and optional editor/OBS
qualification. Remotion's newer shared-memory failure affects future comparison upgrades; the
optional adapter remains pinned to 4.0.513. Main no longer depends on that adapter for exports.
