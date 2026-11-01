# Browser-first final local integration, 1 November 2026

The isolated browser-first candidate integrates main through a00ece3, including qualified BMP
video preparation, automatic scheduling, persistent preparation/chunk reuse, preview/reference
workflows and transparent ProRes output. Browser-only tarballs physically contain no Remotion
packages. Both that installation and an installation with the optional Remotion adapter pass.

Ready passes 688 tests in 115 files, formatting, lint/types, dependency isolation and the decoded
smoke render. Installed checks cover all themes, stills, video backgrounds, cache/recovery,
preview exports, default clip/bundle commands, ProRes/PNG and diagnostics. Optional Remotion also
passes validation and a decoded export. Package inventories and actual runtime reports are retained.

This completes the candidate's current local integration. It does not change production defaults,
prove Linux/Windows operation, qualify every receiving application or satisfy the separate
current-upstream first-export speed objective. The prepared CI matrix remains unexecuted here.
