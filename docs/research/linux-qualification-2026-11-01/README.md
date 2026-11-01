# Linux qualification, 1 November 2026

Status: in progress, no platform qualification claimed.

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

## Observations

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
