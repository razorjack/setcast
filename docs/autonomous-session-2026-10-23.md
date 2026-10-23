# Platform development session, 2026-10-23

Started at 13:35 Europe/Warsaw on master after ecb0f76. Target handoff: about 19:00
(17:00 UTC). Stop starting features at 18:00 and reserve the last hour for validation,
fixes, documentation and commits. Nothing is to be pushed or published.

## Design constraints

Treat features as platform capabilities: explicit configuration, reusable contracts,
renderer independence, documentation and reproducible verification. Keep ordinary implementation
plain; avoid extension frameworks without a concrete consumer. Prefer YAML and CSS customization.
Keep Remotion default. Preserve capture ownership, absolute time, asset readiness, blackout,
projection and journal semantics. Every standalone completed piece gets a commit.

## Work order

1. Configurable endurance tooling. Exercise sustained live input, scene/branding changes,
   capture restart and long exports. Produce machine-readable samples, runtime identity,
   failures and limits. Start a sustained run early. Distinguish browser heap, process memory,
   capture time and wall time. Do not label synthetic local tests hardware qualification.
2. Camera setup patterns. Shared declarative pattern configuration and explicit-time rendering,
   with private live controls, grayscale/highlight steps, motion, detail and framing samples.
   Reuse output protection and projection. Document camera/display limitations and inspect output.
3. Beat-analysis evaluation. Compare bounded multiband onset candidates with the current detector
   using synthetic fixtures and available real recordings. Keep explicit adoption and tap override.
   Ship detector changes only with evidence of better estimates without false locks; evaluation
   tooling is useful independently. No promise of continuous following or detected downbeats.
4. Review all changes, run appropriate baseline/browser/export checks, commit complete pieces,
   record measurements and remaining limits. No unfinished experimental code in the final tree.

## Progress

- Read the current roadmap and repository guide; working tree was clean at session start.
- Existing player check supports long durations, but keeps all samples in memory, changes themes
  only at the start and has no configurable scenario/report contract. Extend the testing capability
  with bounded streaming reports and repeated workloads rather than inventing a product telemetry service.
- Implemented versioned JSON endurance workloads, streaming reports, repeated scene/announcement
  actions and capture restarts with journal validation, plus project-based export measurements
  and ffprobe verification. The short 35-second live run and 10-second export passed. Initial
  live fixture failure was fixed by writing self-contained saved-scene CSS, matching the platform's
  existing scene contract. No production runtime behavior changed.
