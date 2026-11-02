# Linux qualification, started 1 November 2026

Status: in progress. Production correctness, final fresh candidate installations, required
NVENC, decoded 120-second software/NVENC fixtures and the 3,000-capture bitmap resource check
pass on this Fedora x64 host. Three Linux fixes are committed; graphics use SwiftShader.
Current Remotion 4.0.539 has a reproduced named shared-memory leak after injected encoder
failure. All eleven common-font fidelity cases pass, including full encoded black-frame scans
and inspected art/chunk transitions. All 55 worker-screening pairs meet every required quality
comparison, and all 110 outputs pass black-frame scans. All 66 final timed exports pass their full quality comparisons and black-frame scans.
None of the eleven workloads meets the unchanged 30% speed target. Additional Linux CI/live checks are running. Real-master Linux assets are missing. Windows
remains unqualified, the shared Quicksilver CSS fix needs affected macOS repetition, and
main's default remains Remotion.

Starting production revision: 55a7b677b9bf40445d3dad112c411ff9ec002cd0.
The supplied bundle verifies and contains the handoff and both requested branches.
Imported into refs/remotes/linux-handoff without overwriting existing refs; created
renderer/browser-first-candidate at 4c6f21c and renderer/upstream-539-comparison at 6c373c0.
The bundle remains untracked. Production retains its Remotion default.

Host: Fedora 44 KDE, Linux 7.2.13-200.fc44.x86_64, Ryzen 9 5950X (32 logical
CPUs), 67,289,391,104 bytes RAM, Wayland desktop, performance CPU governor.
Initial available disk: 759 GiB; /dev/shm: 32 GiB. Node 26.7.0 and local
Vite+ 0.2.9. FFmpeg 8.1.3 includes libx264, ProRes and libvmaf.
PCI enumerates an RTX 3070 Ti, but the initial sandboxed nvidia-smi cannot communicate with the
driver (see the unrestricted rerun below). Enumeration does not establish hardware graphics or NVENC operation.

Raw commands, output, start times and individual exit statuses:
examples/demo/out/linux-qualification-2026-11-01.
The host inventory is a multi-command diagnostic transcript; its final exit
status does not mark every probe successful. In particular pnpm was absent from
PATH and nvidia-smi failed.

## Current evidence

| Area | Observed result and scope | Evidence |
| --- | --- | --- |
| Production baseline | Formatting, lint/types, 688 tests, dependency isolation and decoded smoke pass. | [Latest baseline log](tuning-evidence-ready.txt) |
| Source and encoded correctness | All 32 theme/orientation worker cases are exact across 1/2/4 workers. Final Quicksilver reruns pass all 64 video cases and repeated static/video worker checks. | [Workers](font-workers.json), [video matrix](quicksilver-fixed-video.json), [looping-video workers](quicksilver-video-workers.json) |
| Cache, resume, preview and ProRes | Final affected checks pass. ProRes establishes FFmpeg decoding/compositing, not an editor or OBS receiver. | [Preparation](font-preparation.json), [preview exports](font-preview-exports-results.json), [ProRes](font-prores.json) |
| Fresh candidate installation | Candidate `5159395` passes browser-only and separate optional-Remotion installations. Browser-only inventory contains no Remotion packages. | [Browser installation](quicksilver-installed-browser.json), [compatibility installation](quicksilver-installed-compatibility.json) |
| NVENC | Actual required `h264_nvenc` acceptance/color/resume and a fully decoded synthetic 120-second export pass on RTX 3070 Ti / driver 615.78.08. | [Acceptance](font-nvenc-acceptance.txt), [endurance](font-nvenc-endurance.json) |
| Resources | 3,000 bitmap captures release all URLs. The 120-second software export passes full decode and four stereo alignment windows; real-master assets remain unavailable. | [Bitmap summary](font-video-memory-summary.json), [software summary](font-export-short-summary.json), [decoded verification](font-software-decoded.json) |
| Current-upstream fidelity | All eleven calibration cases meet every full/regional min/p05/mean PSNR/SSIM and VMAF NEG comparison. All 22 encoded files pass black-frame scans; selected art/join frames were inspected. | [Metrics](calibration-summary.json), [black-frame scans](calibration-blackframe-results.json), [transition inspection](font-transition-inspections.json) |
| Current-upstream failure cleanup | Remotion 4.0.539 leaves an 8,294,464-byte named pool after injected encoder failure, reproduced three times. Successful export cleanup does not supersede this failure. | [Diagnosis](upstream-cleanup.md), [final observer](final-upstream-shm-failure.json) |
| Throughput | All 55 screening pairs pass every required quality comparison, and all 110 outputs pass black-frame scans. Three alternating pairs per workload pass every quality comparison. None meets the 30% target. Browser median time ranges from 5.4% lower to 55.9% higher than Remotion; no failed attempt or new named pool occurred. Loaded calibration times are excluded. | [Final results and spread](performance-table.md), [final quality](timing-summary.json), [final runtime/load/cleanup audit](timing-audit.json). |
| Additional Linux CI/live | Remaining candidate checks are running; full live endurance follows. | No pass is inferred from a workflow definition. |

Final production source fix: `a5a8bbe`. Final candidate: `5159395`. Final current-upstream
comparison: `5d026a6`, with Remotion 4.0.539 / Chromium 157.0.8080.0. Browser capture uses
Playwright 1.64.1 / Chromium 156.0.8078.4 and system FFmpeg 8.1.3. Both comparison arms use
observed SwiftShader; NVENC is a separate encoding qualification. Runtime binary hashes are
retained in [runtime-binaries.json](runtime-binaries.json).

## Comparison method

The quiet comparison uses the frozen `software-corpus/manifest.json` in the raw evidence
directory and current-upstream checkout `5d026a6`. Both adapters use observed SwiftShader,
software H.264 and the medium x264 preset. Browser uses JPEG 100 / CRF 16; Remotion uses
CRF 18 with its observed shared-memory encoder input. Original mismatched-font calibration
is retained but excluded from matched-quality claims.

The first ten references and calibration arms were produced at `a53bcca`; the chunk-boundary
reference uses `5d026a6`. The intervening production change affects only Quicksilver CSS,
which none of these corpus cases selects, plus the video harness artifact naming. Selected
theme and renderer code is unchanged. Every quiet comparison uses final revision `5d026a6`.
See the [source provenance check](reference-source-provenance.json).

Worker screening tests 1, 2, 4, 8 and automatic concurrency independently for both adapters.
One pair per setting selects provisional settings; screening variance is not characterized.
Every screening output must then meet the existing quality comparisons before those settings
are used in three alternating final pairs per workload. All retained final outputs receive
the same measurements, including every full-frame/text-region minimum, p05 and mean
PSNR/SSIM and VMAF NEG against the matching retained lossless reference.

Each timed arm requires a five-second pre-run CPU-busy sample at or below 15%; the harness
waits at most 60 seconds before failing the attempt. Logs retain these samples. Exports
record system load and sampled process-tree/external CPU and RSS. Summed RSS can double-count
shared pages, and process sampling can miss short-lived work. No separate validation, quality,
endurance, hashing or baseline job runs during a quiet timing stage.

Timing includes project loading through cleanup, excluding identity calculation and output
verification. Sessions are fresh, but process and OS caches are shared. These are not
cold-boot or freshly downloaded-runtime timings. Loaded calibration and resource-run wall
times do not establish comparative throughput. The release objective remains at least 30%
lower median wall time in every predefined workload at matched quality.

## Final matched-quality performance

All eleven workloads meet every full-frame/text-region minimum, p05 and mean PSNR/SSIM
and VMAF NEG requirement for all three final pairs. All 66 outputs pass full black-frame
scans. None meets the required 30% lower median wall time. Browser is modestly faster
in CSS filters (5.4%), constellation (3.6%) and portrait (3.0%), and slower in the other
eight workloads. Looping video is 55.9% slower and the long chunk-boundary case is 27.7%
slower. Three observations per arm describe this run's spread; they do not establish
statistical confidence for small differences.

[Every workload, median, range and worker count](performance-table.md),
[per-run CSV](performance-runs.csv), [resource/output-size/runtime details](performance-results.json)
and [interactive chart](performance.html) are retained. Negative time reductions in the table
mean browser export took longer. All timings use the final clean implementation at `5d026a6`.
The highest accepted pre-run busy sample is 0.6%, and the highest mean sampled external
load is 0.3111 of 32 CPU cores. Both adapters use SwiftShader and software H.264; Remotion's
encoder receives `remotionshm`. The frozen 4K case upscales its 2304×1296 art to 3840×2160
in both arms. This is a fixture limitation, preserved before and after measurement.

This Linux result does not meet the release performance requirement. It does not revise
the target, qualify other platforms or authorize browser-first promotion. The independent
Remotion failure-cleanup defect remains recorded even though every successful timed export
removed its newly created named pools.

## Chronological observations

These entries preserve discoveries and failed attempts. Later entries supersede earlier
in-progress statuses; they do not erase the original failures.

- Initial sandboxed bundle import failed because .git is read-only there.
  The authorized elevated local import succeeded.
- Demo asset generation passed.
- Initial ready failed during type checking with 1,813 errors and 27 warnings.
  The pre-existing dependency tree lacks packages/renderer-browser/node_modules,
  including Playwright and workspace links. This is bootstrap failure, not yet
  evidence of a production source defect.
- Frozen installation initially failed opening pnpm's store database in the
  sandbox. An elevated frozen installation is being attempted. Existing local
  Vite+ resolves pnpm 11.22.0 internally despite pnpm being absent from PATH.

All subsequent runbook checks remain pending. Windows remains unqualified.
The 30% matched-quality first-export target and platform requirements are unchanged.

Frozen installation succeeded without lockfile changes. The rerun of ready passes:
688 tests in 115 files, formatting, lint/types, dependency isolation and decoded
90-frame Remotion smoke.

The initial NVIDIA failure was caused by sandbox device visibility. Outside that
sandbox nvidia-smi succeeds: RTX 3070 Ti, 8 GiB VRAM, NVIDIA 615.78.08.
Device nodes exist and systemd-detect-virt reports none. Hardware qualification
must use actual device access; the original sandbox failure is retained.

The first browser doctor failed because pinned headless shell revision 1248 was
not installed. Provisioning downloaded Chromium 156.0.8078.4; Playwright reports
Fedora unsupported and selects its Ubuntu 24.04 x64 build. No dependency or
browser version was changed. The provisioned browser doctor passes all requested
features and identifies NVIDIA OpenGL ES through ANGLE. Its actual NVENC frame
probe also passes. Remotion doctor with swangle passes on Chromium 149.0.7790.0,
SwiftShader and packaged FFmpeg n7.1. These distinct graphics paths must not be
used as an unqualified speed comparison.

No real-master project was found in this checkout; only demo/generated assets
and the core probe fixture are present. Full real-master qualification requires
separate assets and remains blocked.

Both production exporter acceptance suites pass at e5c8bf7 (documentation-only
changes since handoff): fractional ranges, partial final frames, A/V pulses within
5 ms, delayed assets, prepared art on every transition frame, video loops,
performance ramps, repeated theme pixels, all three GPU visualizers across
workers/chunks, destination preservation, cleanup and post-failure/cancellation
recovery. Remotion uses the required swangle setting. These short correctness
runs are not throughput or endurance evidence.

All-theme worker qualification remains in progress. Bunker portrait has unequal
encoded hashes across workers; its existing source-pixel check qualifies the
differences within the predefined sparse one-level rounding budget. This is not
exact encoded equality and does not relax checkpoint identity assertions.
The complete report is retained under workers/report.json in the raw run directory.

The official registry query through pnpm 11.22.0 returns Remotion 4.0.539.
An initial npm query was rejected by devEngines and is preserved. The isolated
candidate is /tmp/setcast-linux-browser-first on renderer/linux-browser-first,
merge revision fb001412c4de1b95b577d1990e97cf6f70d2e4ad. Frozen installation
passes there; execution of its qualification remains pending.

The first worker matrix stops at Masthead landscape, one worker, last captured
frame 34, with page.screenshot timeout after 30 seconds. Before that it records
24 completed cases, including failed Pirate/Afterhours landscape precision checks.
A separate runner mistake lost the individual worker exit-status file: PATH was
edited in run.sh while Bash was waiting on the child, invalidating its input
offset. The parent command returned 2 for the shell parse error; the retained
worker transcript independently contains the uncaught screenshot TimeoutError.
Do not infer the child exit code from that parent status. Subsequent runner
scripts must remain immutable while running.

Diagnostic software CSS rasterization (--disable-gpu-rasterization) makes
Afterhours exact across workers in both orientations, but Pirate landscape still
fails (up to 33 changed pixels by one level). No production flag change is
qualified by these diagnostic runs. Masthead repeated-capture diagnosis follows.

Masthead also times out with software CSS rasterization: the second portrait
round, four workers, last captured frame 63. Three preceding theme/orientation
rounds match exactly. This rejects software rasterization as a screenshot-stall
fix. No production code has changed; independent checks continue.

Independent production checks: same-page backward seeks/font changes/video loops
pass; bitmap roundtrip has exact RGBA; video-frame checks pass all 64
theme/orientation/fit cases, shuffled seeks, 25-to-30/60 fps and selector fallback.
These use the shipped production defaults, not the raster diagnostic wrapper.

Further shipped-default checks pass: H.264 color harness; all-theme/GPU lossless
WebP without FFmpeg; browser GPU determinism, context-loss/failure and synthetic
live input; Remotion GPU recovery; resume; persistent chunk cache; incremental
announcement cache; persistent preparation; browser preview and preview exports.
Preview covers audible playback under slow frames, exact pause/seek, references,
reload and failure cleanup. Export queue checks include request isolation,
cancellation/resume, revision invalidation and shutdown. GPU harness timing samples
are correctness-run diagnostics, excluded from throughput claims.

ProRes passes moving straight-alpha/color, exact source PCM, exact chunk joins,
cache (zero repeated captures), resume (30 reused frames), all-theme alpha and
brightness checks. This qualifies the short FFmpeg decoding/compositing fixture,
not editors, OBS or sustained ProRes. The decoded-verifier positive and negative
fixtures pass. Ready passes again before this evidence commit (688 tests).
The unresolved worker matrix remains failed; baseline success does not supersede it.

Candidate fb00141 passes ready (688 tests), browser acceptance and Remotion
acceptance with swangle. Fresh browser-only package smoke passes with 36 package
inventory entries, no Remotion packages, and lock digest
8676b2ab0c86875511e3ee32599063af9a8f54f73c578c7b47300f1f7f77fbe5.
Its report includes actual diagnostics and completed default workflows.

Fresh optional-Remotion installation also passes: explicit compatibility validation
and six decoded Remotion export frames, alongside installed browser workflows.
The candidate worktree remains clean. Neither installation run is external CI.

NVENC doctor, required-hardware acceptance (19 observed h264_nvenc chunks, no
fallback), color and resume checks pass. Resume includes changed encoder backend
invalidation. The 120-second synthetic NVENC workload uses four workers, required
hardware and 12M bitrate, full decoded verification and four stereo checkpoints.
It is not a substitute for a real master. Initial fixture copying failed because
Node rejects copying a directory into its own descendant even with a filter;
copying only the authored YAML and assets resolves that preparation error.

The 120-second NVENC demo passes full decoding of 3,600 frames and all four sampled
stereo windows at zero measured lag. Observed encoding is h264_nvenc with no
fallback; active graphics are NVIDIA ANGLE. Peak sampled summed process-tree RSS
is 3,498,487,808 bytes, peak sampled run-directory storage 173,843,196 bytes.
Temporary directories are removed after completion. This short synthetic run
does not establish hour-long memory stability or qualify a real master.
The producing revision is e1b4b17 with documentation and worker-harness edits;
production renderer code remains identical to handoff.

The worker harness now accepts --gl auto/default/angle, forwards it to encoded
and source captures, and retains each export's runtime observations even on
failure. Ready passes (688 tests). Pirate with the shipped --gl default setting
selects SwiftShader and passes exact equality in both orientations across 1/2/4
workers. This is software-backend evidence; NVIDIA auto remains failed.
A full software matrix follows without changing production defaults.

All 32 software worker cases pass exact decoded equality. Four repeated Masthead
rounds pass all eight orientation cases at 1/2/4 workers. The proposed Linux auto
fix follows Chromium's default (observed SwiftShader), preserving explicit angle
for opt-in use. This fixes automatic selection by avoiding the failing backend;
it does not fix or qualify the NVIDIA driver's ANGLE rasterization. Both exporters'
acceptance and all affected browser checks must pass under the shipped auto path.

The 3,000-capture bitmap resource check passes: 3,000 created/revoked BMP URLs,
zero active after close, peak two active. Peak sampled summed RSS is
1,937,428,480 bytes; consecutive 750-capture interval medians are
1,840,332,800 / 1,862,696,960 / 1,820,733,440 / 1,838,049,280 bytes.
Some correctness work overlapped, so timings are not performance evidence.
The original two-minute software export passes metadata verification and cleanup;
unlike the NVENC workload, this runbook preset does not request decoded verification.

The Linux automatic graphics-selection fix passes ready (688 tests), doctor with
observed SwiftShader and all requested features, and both exporter acceptance
suites. The complete affected suite is being rerun on the committed fix.

Committed auto-path rerun at 29e7dbc passes all 32 worker cases with exact decoded
equality, plus same-page frame order and bitmap roundtrip. This completes the
worker regression checks on the shipped change, not only an overridden test
launch. All per-export runtime files are retained in fixed-workers.

The complete fixed-production sequence passes on 29e7dbc, with every individual
exit status retained. This includes all 32 worker cases, 64 video cases, color,
WebP, GPU recovery, cache/resume, preview/exports, ProRes and decoded verifier.
The final browser-first integration is a61a0b1 and is undergoing its own ready,
acceptance and fresh-install repetition. Production remains Remotion-default.

### Final candidate installation

Candidate `a61a0b1da1566b1c9638334d480f0b37829ff655` includes the committed Linux graphics fix. Its `ready`, browser acceptance and Remotion acceptance pass. Fresh browser-only tarball installation contains no Remotion packages and passes default workflows, themes, video, cache/resume and ProRes. The separate compatibility installation passes explicit optional Remotion with six decoded frames. Retained `final-candidate-*` and `final-installed-*` reports supersede the earlier candidate checks for the final implementation.

### Final NVENC implementation

After `29e7dbc`, required-hardware diagnostics, all 19 acceptance chunks, production color assertions and resume/invalidation checks pass. The 120-second synthetic NVENC workload also passes: 3,600 decoded frames, four stereo windows with zero measured lag, and temporary-directory cleanup. Active export identities report SwiftShader graphics and `h264_nvenc` encoding. Peak sampled process-tree RSS is 4117929984 bytes across 34 samples. Summed RSS double-counts shared pages. These loaded checks are not throughput measurements and do not replace a real full-length master.

### Current upstream preparation

The isolated `renderer/linux-current-upstream` branch is committed at `2a7381a448326aa8e2003b1838a88a6e319ef70a`, based on final production implementation `29e7dbc`. Registry verification still reports Remotion 4.0.539. Only its six Remotion package pins and lockfile change; production dependencies are unchanged. Ready (688 tests), both acceptance suites and injected encoder failure pass. Current Remotion downloads Chromium 157.0.8080.0. Resource repeats overlap this correctness preparation; none of these timings count as throughput evidence.

A read-only shared-memory observer initially had a Python string-literal syntax error and exited before launching its child. The failed command and original wrapper are retained; the corrected wrapper is being rerun. Initial and post-acceptance/failure `/dev/shm` listings contain unrelated pre-existing pools, which are left untouched. Specific Remotion `rmshm-*` observations follow.

### Current upstream shared-memory failure

The observed acceptance repeat passes and creates/removes 31 new Remotion POSIX pools (32 observed including one pre-existing pool from the first encoder-failure run). Named pools do not remain after its normal/cancellation paths. Injected encoder failure reproduces a leak: a new `rmshm-13983776585987463118` pool, inode 5148, 8,294,464 bytes remains after child exit. The earlier unobserved failure left `rmshm-11411021668764671149`, inode 4965, the same size. The exporter harness reports PASS for destination and temporary-directory cleanup, but the independent observer correctly fails. Both failed observations remain; no shared memory was deleted.

Inspection of installed Remotion 4.0.539 finds that `render-media.js` rejects its public happy-path promise before its asynchronous `finally` disposes shared memory. `render-frames.js` starts page closure in an unawaited `finally`. A teardown race is the working explanation; no production code change is justified by this third-party inspection alone. This remains a current-upstream cleanup qualification failure even if normal-export fidelity/timing measurements succeed.

### Quality orchestration

The initial serial quality coordinator completed standard with every recorded browser metric at least Remotion. It was deliberately interrupted during CSS-filter reference capture to resume the ten remaining independent cases in three validation processes. The SIGINT/AbortError attempt remains under `quality`; it is an orchestration interruption, not a renderer failure. `quality-index.json` maps the accepted case directories. These loaded measurements, including their recorded export wall times, are not performance evidence. Both standard arms identify SwiftShader; current Remotion reports `remotionshm` streaming and browser reports `image2pipe` streaming.

Final bitmap video-memory repeat passes all 3,000 captures and close: created/revoked 3,000/3,000 URLs, peak two, final zero. Peak sampled process-tree RSS is 2380480512 bytes. Four 750-capture interval medians are 2322743296, 2327584768, 2284146688, 2286047232.0 bytes. The bounded end-state and interval samples show no monotonic growth in this fixture; they do not establish full-master resource behavior. See `final-video-memory-summary.json`.

Standard, CSS filters, Field and Tunnel complete numerical quality calibration: browser JPEG 100 / CRF 16 is at least Remotion CRF 18 for every recorded full/regional mean, minimum and p05 PSNR/SSIM and VMAF NEG comparison. Both adapters report SwiftShader. Standard midpoint inspection (reference/browser/Remotion) shows the same visible credits, artwork, decoration and spectrum layout; this is sampled inspection, not complete temporal proof. Remaining cases and timed-worker qualification continue.

### Final software export resources

The unchanged 120-second, one-worker software resource preset passes on the final implementation, with 84 samples, peak summed RSS 3,092,615,168 bytes and no final temporary directories. Four 900-frame interval RSS medians are 2,848,274,432; 3,005,714,432; 2,986,514,432; and 3,050,590,208 bytes. These are short-run observations, not evidence about a full master. A separate `--verify-video` run fully decodes the same 3,600-frame output and verifies four stereo windows at 5, 33, 79 and 110 seconds. Both reports preserve the output/source hashes. No rerender substitutes a different output for verification.

### Linux font-hinting mismatch

The first ten corpus cases meet their relative numerical floor, but inspecting absolute scores reveals a confound: standard Remotion VMAF NEG is about 70 on Linux versus about 96 in the prior macOS comparison. Browser is about 96. A Remotion PNG already differs from the browser reference by 32.6169 dB PSNR (mean absolute 0.30794, maximum 218), so H.264 conversion is not the main cause. A difference image isolates glyph edges. Decoder matrix/range variants do not recover the score. The first midpoint CLI diagnostic rejected unsupported `still --gl`; the supported retry uses the frozen project setting.

Remotion launches Chromium with `--font-render-hinting=none`. Applying that flag only in an isolated browser capture improves PNG agreement to 82.2926 dB PSNR (mean absolute 0.0002125, maximum four levels). Native-size credits retain the same text and layout. This establishes launch-policy font rasterization as the cause of the large text score penalty. The original relative metric passes must not be presented as matched encoder quality.

Linux browser offline capture is being aligned with the legacy Remotion font-hinting policy. Live browser behavior and other platforms are unchanged. All affected correctness and installed-package checks will be repeated, and quality references regenerated before quiet timing. Original mismatched-font captures, references, metrics and failed diagnostic attempts remain retained.

Font alignment is committed as `8eca0d3`. The browser-first merge is `49045197472072d710cf1d923dbc278d3cd35824`; current-upstream merge is `a53bcca346f805a1724eb213e0ebde1b752e1e0a`, retaining Remotion 4.0.539. Ready and both production acceptance suites pass before commit. Full affected production, installation and resource repeats are underway on these commits. The original final chunk comparison had already captured its browser arm before the upstream merge; only browser launch flags and documentation change in that merge, and its remaining Remotion/metric code is unchanged. It remains mismatched-font evidence.

Final font-aligned candidate `4904519` passes ready, both exporter acceptance suites and both fresh installations. Browser-only inventory has 36 packages and no Remotion dependency; the independent optional compatibility installation renders six decoded frames. Current-upstream `a53bcca` also passes ready and both acceptance suites. These final `font-*` reports supersede earlier installation checks. All eleven common-font quality references are being regenerated before worker tuning.

Committed font alignment passes all 32 theme/orientation cases with exact decoded equality across one, two and four workers. Bitmap roundtrip remains exact RGBA. Required NVENC acceptance, color, resume and the 120-second decoded synthetic export pass again. Final video/cache/preview/ProRes and bitmap resource repeats continue; their completion is not inferred from earlier revisions.

The font-aligned video-frame suite fails six comparisons in three Quicksilver shape/fit cases; all 64 cases completed, with 60 non-Quicksilver cases passing. A focused repeat reproduces four failures. Difference bounds and images isolate circular background clip edges, not glyphs, so the timing of discovery does not establish font hinting as the cause. Maximum differences reach 84 levels. Rasterization, hinting and pacing are being isolated without changing tolerances. Quiet measurements remain blocked by this correctness failure.

Quicksilver diagnosis rejects removal of font hinting, removal of unpaced capture, disabled GPU rasterization and disabled GPU: each still fails. Disabling GPU compositing produces exact equality, as does the narrower `.sc-bg-img { will-change: transform; }` hint. Four additional layer-hint repeats pass all four shape/fit cases, every shuffled seek, with maximum pixel difference zero. The production change applies only to Quicksilver video images. Full affected checks follow. The video harness now includes seek ordinals in filenames and reports; previously its repeated frame 29 could overwrite an earlier capture. Earlier reports retain both measurements, but an overwritten PNG cannot be recovered.

The narrow Quicksilver fix passes ready (688 tests), both exporter acceptance suites, all 64 video theme/shape/fit cases, and four rounds of landscape/portrait worker comparison (eight cases, exact decoded equality across 1/2/4 workers). The demo still at 1:50.4 was inspected: art, chrome lettering and layout remain intact. The remaining font-aligned production sequence also passes color, WebP, both GPU recovery harnesses, resume, chunk/incremental/preparation caches, preview/exports, ProRes and the decoded verifier. ProRes alpha maximum error is one level; composite maximum is 2.710 and mean 0.110, with exact source PCM, exact joins, zero repeated captures and 30 resumed frames. A separate encoded looping-video worker repeat is still running.

Quicksilver is committed as `a5a8bbe`; candidate merge is `5159395`. The additional looping 25 fps video check passes all six repeated shape cases with exact decoded equality across 1/2/4 workers (18 exports, 45 frames each). Candidate baseline, acceptance and fresh installation are repeating on that merge. This theme CSS change is shared by platforms; affected macOS checks have not been rerun on this Linux host, and Windows remains unqualified.

The font-aligned 3,000-capture bitmap repeat passes with 3,000 created/revoked URLs, peak two active and zero after close. Peak sampled summed RSS is 2,294,538,240 bytes; four interval medians are 2,234,908,672 / 2,173,059,072 / 2,178,424,832 / 2,209,171,456 bytes. Final NVENC has 43 samples and peak summed RSS 3,989,204,992 bytes. These fixtures use Sterile Tech and are unaffected by the later Quicksilver-only CSS fix. The last software export repeat is running.

Final candidate `5159395` passes ready, both acceptance suites and fresh browser-only/optional-Remotion installation. Current-upstream `5d026a6` passes ready and both acceptance suites. The software resource repeat on `a5a8bbe` passes 120 seconds/3,600 frames with 79 samples, peak summed RSS 3,082,993,664 bytes and no final temporary directories. Separate decoding of that exact file passes all frames and four stereo windows. The ten completed common-font fidelity cases pass every full/regional minimum, p05 and mean PSNR/SSIM and VMAF NEG comparison; the long chunk-boundary case is still running. Their selected themes and renderer code are unchanged by the Quicksilver-only fix; final timed outputs will all be measured on `5d026a6`.

The final `5d026a6` upstream encoder-failure repeat reproduces the leak a third time: `rmshm-7284829172597860390`, inode 7049, 8,294,464 bytes, remains after process exit. The child harness passes destination and temporary-directory assertions; the independent host observer exits 1. No other Remotion export was running during this observation. No library dependency or fast path was patched for the comparison.

All eleven common-font corpus cases now meet every full/regional minimum, p05 and mean PSNR/SSIM and VMAF NEG comparison. All 22 encoded outputs pass full black-frame scans. Midpoint sheets for all cases and before/at/after sheets for DJ/portrait/chunk art changes and the chunk join were inspected. The partially folding long-case midpoint credit matches panelMotion handover to the visible tracklist; it is not missing output. Calibration ran under load and its wall times are excluded from throughput claims. The official registry recheck immediately before timing still returns Remotion 4.0.539. Quiet worker screening will cover 1/2/4/8/auto for both adapters, followed by three alternating pairs with selected settings. Every retained timed output will receive the same quality measurements after timing stops.

Quiet screening completed all 55 pairs on final comparison revision `5d026a6`: five worker settings for each of eleven workloads. Every comparison exits successfully and leaves no new named Remotion pool. All 110 encoded outputs remain retained. Quality verification of every screening output follows before selecting settings for the three-pair series; these screening timings do not establish the release target.

All 110 screening outputs complete quality measurement without errors. Every one of the 55 paired comparisons meets the unchanged full/regional minimum, p05 and mean PSNR/SSIM and VMAF NEG requirements; all videos also pass full black-frame scans. Every timed arm starts within the 15% CPU-busy limit (highest accepted rounded sample 12.4%). The largest sampled mean external load is 3.4024 of 32 CPU cores; this variation remains reported. Source/runtime/cleanup audit confirms clean final revision `5d026a6`, SwiftShader and software encoding throughout, with no new named pools after successful comparisons. The official registry recheck still returns 4.0.539. Final three-pair measurements follow after the evidence checkpoint; no release-speed conclusion is inferred from screening.

The screening evidence checkpoint passes `vp run ready`: formatting, lint/types, all 688 tests in 115 files, dependency isolation and decoded smoke. No renderer source changed during calibration verification or quiet screening. Final repeated timing remains pending.

Git’s optional whitespace check reports the trailing separators written by `printf '%q '` in retained command transcripts. Those raw records are preserved unchanged; this is not a renderer or baseline-check failure. The complete check output is retained as `screening-transcript-whitespace.txt`.

Final quiet timing completes all eleven workloads: three alternating pairs each, 66 exports total, with no failed/busy attempt or new named pool after completion. The highest accepted pre-run CPU-busy sample is 0.6%; the largest sampled mean external CPU load is 0.3111 of 32 cores. All outputs use clean revision `5d026a6`, observed SwiftShader and software encoding. Every final output is now being measured against its lossless reference before interpreting the speed target. The frozen 4K fixture retains its 2304×1296 background enlarged to 3840×2160; the warning and identical input are preserved for both arms.

All three job-created upstream failure pools have been archived with verified hashes and removed after exact inode/UID/size checks and two owner probes. Raw buffers remain retained; no unrelated pool was removed. This manual host cleanup does not fix or qualify Remotion failure cleanup.

After the final timing process exited, all 66 final videos passed full black-frame scans. Detailed fidelity measurement continues. The independent additional candidate Linux CI checks and evidence baseline now run under load; their elapsed times are excluded from performance results. Existing candidate fixed outputs were archived first (only its latest smoke video existed before these additional harnesses).

Additional candidate Linux checks pass the full worker matrix, resume, WebP, both renderer GPU recovery checks, preview and decoded verification. Live output, transport, projection, energy, beats, branding, camera patterns and MIDI pass. Sequence fails reproducibly in two unchanged runs while waiting for the malformed-art scene error notice; original logs are retained and diagnosis continues. Two diagnostic launcher failures (wrong output base, then package resolution outside the workspace package) are also retained separately and are not product failures.

The sequence failure is a control-state race, confirmed by pre-click DOM capture: the manual scene is active and all scene pads/brightness are disabled, but Run/Next remain enabled. LivePerformance.queue rejects a recall during fade-out/loading/fade-in; the failed-scene JSON loads but its image is never requested. Sequence controls now disable Run/Next during those transition phases and report Transitioning; Hold remains available. The unchanged full sequence harness passes with the fix, including malformed-art failure, journal and restart assertions. This change touches live controls only; offline bundle identity will be checked before reusing completed performance evidence.
