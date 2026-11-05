# Quicksilver clipping investigation, 5 November 2026

A dedicated video clipping container eliminates the tested browser worker mismatches on Fedora
SwiftShader, but changes the portrait appearance and custom direct-child CSS matching. Keep it
isolated as commit `94c2c40` on `renderer/quicksilver-clip-container-candidate`, pending those
decisions and macOS repetition. Focused Remotion checks fail on both the
candidate and unchanged baseline. General acceptance and fresh installations pass.

Investigation started from `ba640f0`, following the failed
[Linux parent-layer qualification](../quicksilver-linux-2026-11-05/README.md). Exact encoded
worker/repetition assertions and source budgets remain unchanged. Raw commands, timestamps,
exit statuses, patches and media are under `examples/demo/out/quicksilver-clipping-2026-11-05`.

## Initial observations

A new portrait control repeats the source failure. The clipped video images are removed and
recreated between absolute frame requests. A MutationObserver on a contain fixture sees two
image additions and two removals per frame after initialization. This proves node replacement,
not that replacement is the cause of the clip defect.

Keeping the image nodes mounted initially fails with `EncodingError` from `image.decode()`.
The exporter attempts DOM image decoding while a pending video hold can still replace the
source. A second experiment waits for declared holds and frame commits before decoding DOM
images. It retains fatal image errors and the two stable paint callbacks. The observer then
sees only two initial additions and no removals across ten frames. Nevertheless, all six
compact encoded cases still fail. Stable image lifetime is insufficient to repair this defect.
All compact and HD repeated-video groups and the first compact/HD source-switch groups fail.
Both media/readiness source files were then restored byte-for-byte. The patches are retained
only as rejected experiments.

A soft radial image mask fails one of 135 source comparisons (six changed pixels, maximum one
channel level). A hard radial mask passes all 135 source comparisons. The hard mask also changes
edge pixels against the existing clip; a representative comparison reaches 159 levels at the
boundary. A small whole-frame mean does not establish equivalent edge antialiasing. A fixed-size soft mask also passes the portrait source probe. Both hard and fixed-size soft
masks nevertheless fail compact/HD encoded repetitions and compact/HD source switches in their
first landscape group. Subsequent groups are unexecuted, not passes. Same-size landscape PNG
and direct JPEG diagnostics reproduce source differences before H.264 encoding. Equivalent
rounded clipping and layout without translation also fail. Portrait-only source passes cannot
qualify any of these alternatives.

## Appearance assessment

`severity.py.txt` decodes the retained failed exports at every frame, compares one worker with
the failing multi-worker output, and writes per-frame changed-pixel counts and channel errors.
Side-by-side clips preserve native frame dimensions and normal 30 fps playback, encoded at x264
CRF 0 for inspection. These are comparison artifacts, not new exporter performance measurements.

The retained stills show complete scene content. The source defect is localized around the orb;
encoded differences extend beyond it and into later frames. No controlled human playback study
has established a visibility threshold. Neither whole-frame averages nor a passing single still
can establish that the defect is imperceptible or that repeated exports are deterministic.

## Dedicated clipping container candidate

The next prototype adds `.sc-bg-video` around the video media and clips that stable wrapper in
frame coordinates. Quicksilver's two contained video images are composed before clipping. The
ornamental `.sc-bg::before` remains outside the clip, and static art keeps its existing clip.
This avoids defining the circle relative to a moving and resized image. Passing output supports
this structure as a repair candidate; it does not identify Chromium's internal defect.

The prototype passes all six compact and six HD repeated-video groups, and all six compact and
six HD source-switch groups, with exact decoded equality across workers 1/2/4 and three fresh-page
repetitions. The clean implementation was checked separately without CSS overrides on
`renderer/quicksilver-clip-container-candidate`. Master retains the production implementation from `ba640f0`.

The markup change affects custom selectors such as `.sc-bg > .sc-bg-img`. Descendant selectors
continue to select the images; the default wrapper uses `display: contents`. The theme contract
documents the migration. Built-in theme checks cannot establish compatibility with every custom
stylesheet, and the existing video selector check verifies the media element type rather than
all selector effects. macOS compact/HD repetitions and source switches are still required before
cross-platform qualification. Windows remains unqualified.

### Appearance tradeoff found during qualification

The candidate removes the colored rim around the portrait video orb in contain mode. This is a
visible change, not merely numerical noise. The browser adapter's blurred underlay has inline
`scale: 1.1`; the old per-image circle expands with that image, while the new frame-relative
container clips both layers at the same orb radius. Landscape cover has no enlarged underlay.
`candidate-encoded-appearance.json` and the retained before/after images document this separately
from determinism. Do not promote the candidate as appearance-equivalent. Either accept this
appearance explicitly or investigate separate stable clipping containers for the video layers,
with equivalent geometry and the same platform checks. The latter is not implemented here.

## Runtime and evidence interpretation

The test source starts at `ba640f0` with the retained candidate patch applied. Runtime reports
therefore identify that revision and `dirty: true`; `source-identity.json` identifies the exact
package/script/lockfile contents. The final commit contains those source changes. Fedora 44 x64,
Node 26.7.0, vp 0.2.9, pnpm 11.22.0 and FFmpeg 8.1.3 match the preceding qualification. Browser
reports observe Chromium 156.0.8078.4 with ANGLE SwiftShader and libx264. They do not qualify
explicit NVIDIA ANGLE, NVENC on this candidate, Linux ARM64 or another Chromium version.

`checks.json` retains commands, timestamps and exit statuses; per-directory reports retain
assertion results and observed runtime identities. Some diagnostic scripts intentionally return
zero after collecting failing comparisons. Read `qualified` and mismatch counts in their JSON;
zero means the probe completed, not that its pixels passed. Encoded qualification uses the
unchanged exact decoded hash assertion. No source tolerance or queue bound was loosened.

The first persistent-image experiment fails DOM decoding. The next coordinator accidentally
reuses the `lifetime-persistent` label, which the helper refuses with status 99 before executing
or overwriting evidence. A separate `lifetime-settled` command captures the corrected experiment.
Other coordinator commands continue independently after failures; a coordinator's final status
is not the aggregate qualification result. Every executed check has its own status file.

Scripts are archived with `.txt` suffixes so the repository's source formatter does not alter
experimental evidence. Copy them back to the matching ignored output directory to reproduce
relative imports. Source probes reuse the previous qualification's generated `compact` fixture;
create that with the maintained worker command if transferring only committed evidence.
`persistent-image.patch.txt` and `persistent-settled.patch.txt` apply to the baseline media code;
they are rejected experiments. `clip-container.patch.txt` is the initial wrapper prototype and
requires the override in `wrapper/summary.json`. `candidate-source.patch.txt` is the clean final
candidate, used by the maintained checks without fixture CSS overrides.

`artifacts.json` inventories ignored media and logs with SHA-256 hashes. Large PNG sequences and
MP4s remain local under the recorded output root. The committed report retains compact JSON,
logs, scripts and representative images. [The comparison viewer](comparison.html) shows the
original worker difference separately from the candidate's appearance change. Full normal-speed
paired clips of the original failed exports remain in `compact-paired.mp4`, `portrait-paired.mp4`
and `hd-paired.mp4` under that output root.

This investigation makes no new throughput or sustained-resource claim. Performance measurement
must run separately during a quiet period on whichever implementation is finally accepted.
The broader release requirements remain in the roadmap: platform qualification including Windows,
Linux real-master resources, the software-live dropped-sample failure and the unchanged
first-export performance objective. This candidate does not resolve those requirements.

## Clean candidate results

| Check | Result | Evidence |
| --- | --- | --- |
| Browser compact repeated video | Six groups exact, workers 1/2/4 | `candidate-compact` |
| Browser HD repeated video | Six groups exact, workers 1/2/4 | `candidate-hd` |
| Static art | Six HD groups exact | `candidate-static` |
| All-theme seeks | 64 shape/fit cases pass | `candidate-seeks` |
| Browser video/image/video switches | Six compact and six HD groups exact | `candidate-switches`, `candidate-switches-hd` |
| Browser source PNGs | All 270 comparisons exact | `candidate-source-portrait-control`, `candidate-source-landscape-control` |
| Exporter acceptance | Browser and Remotion pass | `candidate-browser-acceptance`, `candidate-remotion-acceptance` |
| Fresh installations | Browser-only and optional Remotion pass; browser-only inventory has no Remotion packages | `candidate-installed-browser.json`, `candidate-installed-remotion.json` |
| Baseline CI | `vp run ready` passes formatting, lint/types, all 694 tests, dependency isolation and decoded smoke | `candidate-ready.txt` |
| Remotion focused repetition | Compact/HD repeated video and compact/HD switches fail first portrait group after passing first landscape group; later rounds unexecuted | `candidate-remotion-*` |

The Remotion result is a qualification failure, despite passing general acceptance and installed
compatibility workflows. Its actual runtime is Chromium 149.0.7790.0 with SwiftShader and pinned
Remotion 4.0.513. It is not the browser exporter's Chromium 156 runtime. The unchanged baseline
also fails compact repeated-video and compact source-switch assertions in the first portrait
group, and both HD commands in the first landscape group. Later groups are unexecuted.
`baseline-source-restored` proves the runtime source and lockfiles match `ba640f0` during these
checks; `candidate-restored` verifies the exact candidate patch was reapplied afterward. That establishes a baseline problem; it does not prove
that every candidate difference has the same cause or that the candidate is regression-free.
Retained decoded-frame diagnostics show no missing scene content in the inspected compact
Remotion sample, but they do not establish imperceptibility during playback.

### Remaining decisions and checks

Keep this implementation isolated. It resolves the tested browser worker nondeterminism on this
Linux runtime, but promotion still requires an appearance decision about the removed colored
rim, review of direct-child CSS compatibility, macOS compact/HD repetitions and source switches,
and resolution or explicit tracking of Remotion's focused qualification failures. A shared
geometry change must keep both platform reproducers. No new software stack is necessary to try
this approach; replacing the renderer would not itself establish stable Chromium paint behavior.

The shared checkout was returned to master after committing the candidate. Master receives only
this evidence and the roadmap/handoff updates; production source and renderer defaults remain
unchanged. Candidate source identities and the patch remain preserved when collecting the final
master documentation checks. Raw command logs retain their original trailing spaces and output
bytes rather than being reformatted.

Final master `vp run ready` also passes all 694 tests, formatting, lint/types, dependency
isolation and decoded smoke. `master-production-unchanged` confirms package, script, lockfile
and build configuration contents still match `ba640f0`. The candidate remains unpromoted.
