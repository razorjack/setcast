# Browser-first candidate qualification, 1 November 2026

This directory retains local Apple M1 Pro / macOS evidence for the isolated browser-first
migration candidate based on main commit 979582c. The installed JSON reports record exact
Node, package, Chromium, FFmpeg, graphics and encoder probe results. The browser-only virtual
store contains no Remotion package; the compatibility installation explicitly includes its
optional adapter. Both tests install fresh tarballs, not workspace dependency links.

Both install modes passed their default browser workflows. Compatibility mode also validated
and decoded a six-frame Remotion export. Both adapter acceptance suites passed. Final `vp run
ready` passed 667 tests in 111 files, formatting/lint/types, required dependency isolation and
90 decoded H.264 frames with audible AAC and moving visuals. Its local console log is
`/tmp/setcast-browser-first-commit-ready.log`.

Two failed harness attempts are retained: pnpm ignored overrides in package.json (moved to
pnpm-workspace.yaml), and the compatibility report writer shadowed its report variable after
a successful export (renamed the validation response). Neither failure was suppressed.

Linux/macOS/Windows CI jobs and report uploads are implemented but have not run. This local
check does not qualify Windows/Linux, NVENC, sustained exports on other backends, or a general
performance advantage. The migration candidate remains separate from main. See
[the migration guide](../../browser-first-migration.md) for setup and rollback.
