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
