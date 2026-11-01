# Browser-first cache and ProRes integration, 1 November 2026

The isolated distribution candidate merges production e8061ce, including persistent whole-set
preparation and transparent ProRes 4444 output. The merge preserves the candidate's browser
default and optional Remotion package, and adds ProRes to installed workflow verification.
Production defaults remain unchanged.

Ready passes 688 tests in 115 files, formatting, lint/types, dependency isolation and the decoded
H.264 smoke render. Fresh tarball installations pass both with Remotion physically absent and
with the optional adapter installed. The browser-only run covers all themes, video, PNG/WebP,
cache reuse, resume, preview export, default clip/bundle commands and transparent ProRes MOV.
The compatibility run also validates and decodes an explicit Remotion export. The reports retain
package inventories and actual diagnostics.

The first ready attempt overlapped another check process and hit two five-second CLI subprocess
test deadlines. Its log is retained. The second run passed without relaxing those tests. A separate
full-master resource export remained active, so no elapsed time here is performance evidence.

This is local macOS qualification. Linux/Windows installation, sustained platform checks and the
unchanged current-upstream speed target still block promotion to production default.
