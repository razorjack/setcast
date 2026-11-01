# Linux renderer qualification handoff

This runbook continues the [renderer replacement plan](renderer-replacement-plan.md) on Linux.
As of 1 November 2026, the user has a Linux machine and no easy access to Windows. Linux execution
has not happened in the macOS session that prepared this document. Windows remains unqualified;
its absence does not waive a release requirement or authorize changing the default renderer.

The Linux session should complete the work that its machine supports, fix reproducible defects,
record observations as they occur, and commit each coherent change. Do not publish, push, start
external CI or change the default on main. Ordinary local fixes and qualification are authorized.
Do not restart rejected capture experiments unless Linux supplies new evidence relevant to them.

## Source and evidence to bring

Read root `AGENTS.md`, this runbook, the replacement plan and the latest entries in
[renderer-replacement-log.md](renderer-replacement-log.md). The important refs at handoff are:

| Ref | Revision before this handoff | Purpose |
| --- | --- | --- |
| `master` | `4f84e48` | Promoted bitmap preparation, cache, preview and ProRes; Remotion remains required/default. Use this ref with the handoff commit included. |
| `renderer/browser-first-candidate` | `4c6f21c` | Browser default and genuinely Remotion-free installed CLI. Qualified code is `e28d2bd`; subsequent merge is documentation only. |
| `renderer/upstream-539-comparison` | `6c373c0` | Historical Remotion 4.0.539 / Chromium 157 comparison configuration. Its browser code is older than the promoted bitmap path. |

These are local branches, not a promise that the remote has them. Transfer the committed refs
before starting. A Git bundle avoids publishing anything. On the source machine, after committing
this handoff, create and verify a bundle outside the repository:

```sh
git bundle create /tmp/setcast-linux-qualification.bundle master renderer/browser-first-candidate renderer/upstream-539-comparison
git bundle verify /tmp/setcast-linux-qualification.bundle
```

Copy that file to Linux using the user's normal file-transfer method. For a new checkout:

```sh
git clone -b master /path/to/setcast-linux-qualification.bundle setcast
cd setcast
git branch renderer/browser-first-candidate origin/renderer/browser-first-candidate
git branch renderer/upstream-539-comparison origin/renderer/upstream-539-comparison
git log -1 --oneline
git status --short
```

Here `origin` is the local bundle, not GitHub. In an existing checkout, verify the bundle and fetch
its heads into a new namespace such as `refs/remotes/linux-handoff/*`; inspect before creating
work branches. Do not overwrite existing branches or user changes. Do not copy macOS
`node_modules`, browser downloads, build outputs or render caches to Linux.

The bundle contains tracked source and research reports. It excludes ignored demo audio, frozen
corpus media, real masters and large render outputs. Regenerate portable fixtures below. A full
real-master check needs a separately supplied project directory containing its audio/art and
relative assets. Existing macOS absolute paths in historical reports are provenance, not usable
Linux inputs. Do not download arbitrary replacement recordings or commit private media.

## 1. Prepare and identify the host

Use the Node version in `.node-version` (26.7.0 at handoff), the standalone `vp`, and the lockfile's
pnpm version (11.22.0). Do not install the global npm `vite-plus` package. After bootstrap, use the
checkout's `node_modules/.bin/vp` to avoid the duplicate Vitest runner described in `AGENTS.md`.
Use the repository's existing toolchain installation instructions if these tools are absent.

For Debian/Ubuntu, the existing CI provisions FFmpeg and Playwright system dependencies this way:

```sh
sudo apt-get update
sudo apt-get install -y ffmpeg
vp install --frozen-lockfile
export PATH="$PWD/node_modules/.bin:$PATH"
vp exec --filter @setcast/renderer-browser playwright install --with-deps chromium
vp run demo-assets
```

Use the distro's package manager on other systems and record it. Run exports as the normal user.
The package smoke requires `pnpm` on PATH. Verify `node --version`, `vp --version` and
`pnpm --version`; do not silently update lockfiles or browser versions during bootstrap.
Correctness needs FFmpeg/ffprobe with H.264/AAC and ProRes support. Comparative quality additionally
uses `libvmaf`; record an unavailable filter as a measurement blocker, not a passing metric.

Create a dedicated evidence directory under ignored output. The following Bash helper retains
stdout, stderr and exit status without masking a failed command behind `tee`. Every label is unique;
a failure stops the current shell block. Resume independent work in a new block after recording it.

```bash
set -euo pipefail
mkdir -p examples/demo/out
linux_run=$(mktemp -d "$PWD/examples/demo/out/linux-qualification-XXXXXXXX")
run_check() {
  local label="$1"
  shift
  test ! -e "$linux_run/$label.txt"
  printf '%q ' "$@" > "$linux_run/$label.command.txt"
  printf '\n' >> "$linux_run/$label.command.txt"
  local status=0
  "$@" > "$linux_run/$label.txt" 2>&1 || status=$?
  printf '%s\n' "$status" > "$linux_run/$label.exit.txt"
  cat "$linux_run/$label.txt"
  return "$status"
}
printf '%s\n' "$linux_run"
run_check revision git rev-parse HEAD
run_check working-tree git status --short
run_check os cat /etc/os-release
run_check kernel uname -srmo
run_check cpu lscpu
run_check memory free -b
run_check storage df -h . /tmp /dev/shm
run_check node node --version
run_check vp vp --version
run_check pnpm pnpm --version
run_check ffmpeg ffmpeg -version
run_check ffprobe ffprobe -version
run_check filters ffmpeg -hide_banner -filters
```

Record whether this is a physical host, VM or container, architecture, available CPU/memory and
any cgroup quotas, GPU model/driver if present, and headless versus desktop session. Linux x64
evidence does not qualify Linux ARM64. Record other workload activity, power settings and free disk
space. Do not collect secrets or a complete environment dump. Do not terminate another project's
processes. Low storage is a reason to preserve reports and pause, not erase previous evidence.

## 2. Qualify the production implementation

Run from the source checkout, sequentially. `ready` includes the Remotion smoke and may download
its pinned Chrome on first use. `doctor` itself never downloads a browser.

```bash
run_check ready vp run ready
run_check browser-doctor node packages/cli/bin/setcast.js doctor --renderer browser --require still,webp,video,gpu,resume,cache,alpha,prores --json
run_check remotion-doctor node packages/cli/bin/setcast.js doctor --renderer remotion --gl swangle --require still,video,gpu --json
run_check browser-acceptance vp run export-acceptance --adapter packages/renderer-browser/src/export/index.ts --out "$linux_run/browser-acceptance"
run_check remotion-acceptance vp run export-acceptance --gl swangle --out "$linux_run/remotion-acceptance"
run_check frames node packages/renderer-browser/bench/frames.ts
run_check workers node packages/renderer-browser/bench/worker-frames.ts --workers 1,2,4 --out "$linux_run/workers"
run_check bitmap node packages/renderer-browser/bench/bitmap.ts --out "$linux_run/bitmap"
run_check video-frames node packages/renderer-browser/bench/video-frames.ts --image-only --out "$linux_run/video-frames"
run_check color node packages/renderer-browser/bench/color.ts --out "$linux_run/color"
run_check webp node packages/renderer-browser/bench/webp.ts
run_check gpu node packages/renderer-browser/bench/gpu.ts
run_check remotion-gpu node packages/renderer-remotion/bench/gpu-recovery.ts
run_check resume node packages/renderer-browser/bench/resume.ts
run_check cache node packages/renderer-browser/bench/cache.ts --out "$linux_run/cache"
run_check incremental node packages/renderer-browser/bench/incremental.ts --out "$linux_run/incremental"
run_check preparation node packages/renderer-browser/bench/analysis-cache.ts --out "$linux_run/preparation"
run_check preview node packages/renderer-browser/bench/preview.ts
run_check preview-exports node packages/renderer-browser/bench/preview-exports.ts --out "$linux_run/preview-exports"
run_check prores node packages/renderer-browser/bench/prores.ts --out "$linux_run/prores"
run_check decoded-verifier node packages/renderer-browser/bench/export-verification.ts
```

Read every result. Some older harnesses write fixed `examples/demo/out/*-check` directories and
have no `--out` flag. Preserve those outputs before rerunning them; the console log alone may omit
images and reports. `preview.ts` already invokes the CLI preview checks; `preview-cli.ts` is an
imported helper, not a standalone test. Do not pass `--avfoundation` to ProRes on Linux. Its Linux
pass qualifies FFmpeg decoding/compositing, not AVFoundation, OBS or an editor.

Headless graphics need explicit interpretation. Remotion acceptance uses `--gl swangle` because
automatic ANGLE can render CSS while failing WebGL 2 without a hardware backend. Browser export
currently accepts only `auto`, `default` and `angle`. The handoff used ANGLE for Linux
`auto`; Linux execution found source-pixel failures and screenshot stalls on NVIDIA. The
qualification fix makes browser `auto` follow Chromium's default (SwiftShader in the pinned
runtime), while explicit `angle` remains unqualified on that driver.
Do not pass Remotion's `swangle` to it. Retain the actual WebGL renderer/vendor from diagnostics
and active exports. A SwiftShader pass is software qualification, not GPU acceleration evidence.

If browser `auto` fails WebGL, preserve the report, diagnose with `doctor --gl default`, and fix
the runtime selection or explicitly scoped backend support if needed. A manually changed launch
flag in a test does not qualify shipped defaults. Re-run affected checks on committed fixes.
Do not remove GPU cases, weaken frame/color tolerances, disable readiness or suppress rejection
errors to make the platform pass. Exact cross-driver/macOS pixel identity is not required;
same-runtime determinism, source precision budgets and the existing fidelity contracts are.

## 3. Qualify the browser-only distribution candidate

Create a local work branch from `renderer/browser-first-candidate` in an isolated worktree.
Bring in the handoff documentation and any qualified production fixes, preserving the candidate's
browser default and optional compatibility adapter. Record the resulting commit. Install Linux
dependencies and browser in that checkout, regenerate demo assets, and create a new evidence
directory/helper as above. Do not share a macOS dependency tree or an old renderer cache.

Run `ready` and both exporter acceptance commands there, then:

```bash
run_check installed-browser vp run package-smoke --browser --report "$linux_run/installed-browser.json"
run_check installed-compatibility vp run package-smoke --report "$linux_run/installed-compatibility.json"
```

`--report` and fresh independent dependency installation belong to this candidate. Main's older
package smoke lacks that option and cannot prove a Remotion-free distribution. Do not substitute
a workspace import test. The browser-only report must show no Remotion packages and successful
default render/still/clip/preview/bundle, themes/video, cache/resume, ProRes and diagnostics checks.
The second installation must exercise explicit optional Remotion. Keep package inventories,
installation lock digest, actual runtime reports and complete failure logs.

The candidate's `.github/workflows/ci.yml` contains the prepared Linux/macOS/Windows installation
matrix. Execute its Linux commands locally; do not count the workflow file as executed CI.
If a fix affects shared exporter behavior, repeat the relevant section 2 checks in this final
candidate, not only in main. Keep main's default unchanged.

## 4. Linux hardware encoding, when available

Linux hardware encoding selects `h264_nvenc`. A GPU used by WebGL, or `h264_nvenc` in FFmpeg's
compiled encoder list, does not establish usable NVENC. Record NVIDIA device/driver visibility
when available, then request the actual encoding probe:

```bash
run_check nvenc-doctor node packages/cli/bin/setcast.js doctor --renderer browser --require hardwareEncoding --json
```

If it succeeds, run the required-hardware checks:

```bash
run_check nvenc-acceptance node packages/renderer-browser/bench/hardware.ts --out "$linux_run/nvenc-acceptance"
run_check nvenc-color node packages/renderer-browser/bench/color.ts --hardware --out "$linux_run/nvenc-color"
run_check nvenc-resume node packages/renderer-browser/bench/resume.ts --hardware
```

Require observed `h264_nvenc`, no fallback, decoded frame/audio correctness, color checks and
checkpoint identity behavior. Qualify a sustained run with `hardwareAcceleration: required` and
an explicit bitrate on a copied project before advertising sustained NVENC support. An unavailable
NVIDIA device does not block software Linux qualification. Record NVENC as unavailable/unqualified.
On a host without NVENC, also verify that `if-possible` reports its reason and uses software,
while `required` fails before capture and preserves an existing destination. Never relabel a
software fallback as a hardware pass. New AMD/Intel encoder support is outside this handoff.

## 5. Linux resources and sustained export

Generate the portable eleven-case corpus once and retain its manifest. Use absolute paths if
multiple worktrees will consume it. This freezes Linux inputs; it does not reproduce macOS source
hashes automatically, because FFmpeg and generated media can differ across versions.

```bash
run_check corpus node packages/renderer-browser/bench/replacement-corpus.ts --out "$linux_run/corpus"
run_check video-memory node packages/renderer-browser/bench/video-memory.ts "$linux_run/corpus/looping-video" --bitmap --frames 3000 --out "$linux_run/video-memory"
run_check export-short node packages/renderer-browser/bench/endurance.ts --config packages/renderer-browser/bench/endurance/export-demo.json --out "$linux_run/export-short"
```

Then use a real full-length master, preserving its assets. Write a workload JSON following
[endurance.md](endurance.md), with `mode: export`, the Linux project path, its actual full duration,
`verification: decoded`, representative non-silent `audioAt` windows and explicit concurrency
matching the automatic selection observed for that host. The macOS run used four workers and a
3,372-second master; those values are evidence from that machine, not universal Linux settings.

```sh
node packages/renderer-browser/bench/endurance.ts --config /path/to/linux-full-master.json --out /path/to/NEW_OUTPUT_DIRECTORY
```

Retain the workload, source hashes, render revision, complete frame decode, per-channel alignment,
sampled process-tree RSS, disk usage, temporary-directory cleanup and errors. Review memory by
steady-state intervals, not just start/end values. Summed RSS double-counts shared pages and omits
external services. Sampled audio does not prove every sample. Preserve the 2 GiB free-space reserve.
If no real master is supplied, complete portable work and mark real-master qualification blocked;
looping the short demo is not equivalent evidence. Resource runs may be loaded, but such wall
times are not throughput evidence. Do not run them alongside the quiet comparison below.

## 6. Current-upstream fidelity and throughput on Linux

This is separate from platform correctness. The first-export objective remains at least 30% lower
median wall time than tuned current Remotion on the predefined suite at matched quality. The
macOS target was not met. A Linux result cannot be generalized to macOS or Windows.

Create a research worktree from the final qualified production/candidate code. Inspect
`renderer/upstream-539-comparison` for the deliberate dependency changes and runtime observations;
do not benchmark its stale browser implementation as the final renderer. Verify the current
published Remotion release at execution time using the package registry/official documentation.
Pin all related Remotion packages consistently in this isolated worktree, preserve a deliberate
Playwright/Chromium choice and lockfile, and record versions. Retaining 4.0.539 is useful historical
evidence, but call it current only if it still is. Do not upgrade production incidentally.

Before timing, run ready, both acceptance suites and
`node packages/renderer-remotion/bench/encoder-failure.ts --out NEW_DIRECTORY` on the comparison
revision. Keep Node's normal rejection policy. On Linux, inspect `/dev/shm` capacity and named
shared-memory resources before and after normal completion, injected encoder failure and
cancellation. Record whether Remotion actually uses `remotionshm` or a screenshot/image sequence
fallback. Attribute resources to the job; never delete unrelated pools. Resource cleanup is not
proved by an intact MP4 or an empty export directory.

The Fedora execution found that Remotion 4.0.539's encoder-failure harness passes its existing
assertions while a named POSIX pool remains after process exit. Use the host's `/dev/shm`;
a sandbox may expose an empty private mount. The retained
[pool observer and diagnosis](research/linux-qualification-2026-11-01/upstream-cleanup.md)
distinguish the job's new `rmshm-*` pools from pre-existing resources. Do not count the
encoder-failure harness alone as shared-memory cleanup qualification.

Use the existing quality tools, not just encoded-file hashes:

```sh
node scripts/corpus-quality.ts --manifest /absolute/path/to/corpus/manifest.json --upstream /absolute/path/to/comparison-checkout --out /path/to/NEW_QUALITY_DIRECTORY
```

This coordinator runs one worker and uses browser JPEG 100 / CRF 16, with the fixture's Remotion
settings. It reports measurements, not an automatic quality pass. Read the metrics and inspect
the retained frames/regions for missing content, color, typography, banding and art transitions.
Use the plan's frozen quality requirements and retain lossless references until further checks
finish. `--discard-reference` removes the bulk FFV1 needed for later comparisons, so omit it here.
If headless GL requires a fixture setting, freeze and document it before measuring, and retain
both adapters' actual backend identities. Do not compare hardware graphics against software
graphics as if the renderer alone caused the difference.

Next qualify the exact concurrency/settings to be timed. Automatic Remotion hashes differed from
one-worker output in the macOS study; earlier one-worker quality does not qualify those outputs.
For every timed output, use `scripts/render-quality.ts --reference REFERENCE_JSON --video MP4
--comparison COMPARISON_JSON --out NEW_DIRECTORY` against the matching lossless reference. Verify
input/range identities. The report measures full-frame and text-region PSNR/SSIM and VMAF NEG;
missing metrics or a frame association failure must remain explicit.

For each of the eleven corpus cases, use its manifest `at` and `seconds` and run three alternating
pairs after calibrating quality and tuning workers. This template shows the standard case with
the previous calibration values, which must first pass on Linux:

```sh
node scripts/render-compare.ts /absolute/path/to/corpus/standard --at 90 --seconds 10 --repeat 3 --browser-concurrency auto --remotion-concurrency auto --browser-crf 16 --browser-jpeg-quality 100 --remotion-crf 18 --idle-busy .15 --out /path/to/NEW_TIMING_DIRECTORY
```

Run no other own validation/endurance job during timing. Keep the 15% pre-run CPU-busy requirement,
alternating order, complete failed/busy attempts and any quiet retries in separate directories.
Observe external load; do not stop the user's other project or raise the threshold to finish.
Record each workload's median, range, output bytes, actual worker/capture/encoder/backend identity
and process resources. Do not mix older render-only timing boundaries with current end-to-end
loading-through-cleanup results. Standard, CSS filters, Field, Tunnel, Constellation, video,
DJ/art/branding, portrait, 60 fps, 4K and chunk-boundary remain in the suite; a quick three-case
screen is not the full target. Keep regressions visible. Record any safe optimization as a separate
commit and repeat affected correctness/quality checks before timing it.

## 7. Additional Linux checks and completion record

After offline priorities, run the remaining Linux commands in the candidate CI `check` job for
synthetic live input, transport, output recovery, sequence/replay, projection, branding and MIDI.
If time and host resources permit, execute the live software and GPU-recovery endurance workloads
from [endurance.md](endurance.md), keeping each backend/workload/duration explicit. These are
additional Linux milestones, not proof of physical mixers, OBS integration or display latency.
Do not let unavailable hardware prevent completing independent software checks.

Create `docs/research/linux-qualification-YYYY-MM-DD/README.md` and retain compact JSON reports,
workload/config files and text logs there. `.log` is ignored; use `.txt` for committed logs. Keep
large videos/lossless references in ignored output and list their paths and SHA-256 hashes.
Document host scope, producing commits and dirty state, commands/exit statuses, observed runtimes,
pass/fail/unavailable/not-run outcomes, failure reproductions, fixes and subsequent passing reruns.
Preserve original failures. Update the replacement log during work, not only at the end.

Commit fixes in coherent pieces, run `vp run ready` before commits as required by `AGENTS.md`,
and repeat both exporter acceptance suites for exporter/media/readiness changes. Record any failed
required check honestly; do not call the affected milestone complete. Reconcile the plan and
migration guide with the final Linux evidence and link the reports. A docs-only evidence commit
must not imply unexecuted checks passed.

The final report must distinguish software Linux installation/export qualification, the exact
graphics backend, optional NVENC qualification, full-master resources and matched-quality speed.
Windows stays untested. Changing the supported-platform scope or revising the speed target needs
an explicit roadmap decision from the user; this handoff does neither. Keep browser-first promotion
pending until the existing release requirements pass or the user explicitly changes them.
