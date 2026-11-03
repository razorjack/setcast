# Direct video readback follow-up, 3 November 2026

Decision: retain the production canvas copy. The direct-readback candidate matches the short
opaque export but is not a general exact-pixel replacement. A transparent decoded video exposes
an RGBA difference. The performance study also remains unavailable under concurrent host load.
No production video code changes in this milestone.

## Evidence

- Two quiet-machine attempts stop before capture after 60 seconds above the existing 15% CPU
  limit. Neither attempt supplies timing evidence. Other projects were not stopped.
- The first correctness attempt finds the pinned Chromium cache absent. Chromium 156.0.8078.4
  is reinstalled in ignored workspace output. The next attempt exports two seconds at 1080p
  with four workers through both preparation paths; decoded video hashes match. The run is
  explicitly correctness-only under load, with process-resource observations retained. Its
  one-pair wall times are not a speed comparison or sustained resource qualification.
- The first alpha comparison accidentally uses CanvasSink's default `alpha: false`, as production
  currently does. Its 180 equal samples are opaque evidence only. An added partial-alpha assertion
  correctly rejects that setup. Enabling `alpha: true` in the isolated probe exposes a difference
  at the second shuffled seek (frame 29). The final harness retains the report and exits 1.
  Both decoders use poolSize 1, while the control creates and draws into a fresh canvas per seek.
- Production video backgrounds currently use the opaque CanvasSink default. This finding does
  not claim an existing alpha-input regression. It rejects an unrestricted readback substitution
  and establishes an additional fixture for future transparent-video work. A separately scoped
  opaque-only optimization could be revisited if quiet complete-export measurements justify it.

Reports and reproduction sources are adjacent. Paths in archived sources resolve when copied
back to `examples/demo/out/readback-followup-2026-11-03/`. The alpha fixture is 30 generated RGBA
frames at 96x64/25 fps encoded as lossless VP9 with yuva420p and auto-alt-ref disabled. Source
pixels use R=(3x+7f)%256, G=(5y+3f)%256, B=(x+y+11f)%256, A=floor(255x/95).
Raw videos and browser downloads remain ignored. These checks precede plugin integration.
