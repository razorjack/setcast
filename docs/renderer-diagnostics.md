# Renderer capabilities and setup diagnostics

`setcast capabilities --renderer browser` describes the Setcast adapter's declared support.
Add `--json` for a versioned descriptor. Omit `--renderer` to select Remotion, the default.
This command does not read project configuration, load rendering dependencies, start processes,
download executables or check installed devices.

The same descriptor is exported as `capabilities` from
`@setcast/renderer-browser/capabilities` and `@setcast/renderer-remotion/capabilities`.
`RendererCapabilities`, `RendererName` and `RendererFeature` belong to `@setcast/core`.
These lightweight entries are usable by configuration tools without importing a renderer.

The descriptor covers Setcast's current API, not the underlying library's full feature set.
Both adapters support PNG/JPEG/WebP stills and H.264 + AAC in MP4/MOV/MKV. Browser export adds
resume; Remotion supports hardware encoding when a compatible device works. Declared GPU support
means Setcast can render WebGL 2 visualizers, not that a hardware GPU is present or fast enough.
`concurrency.max: null` means the adapter delegates its upper limit to the runtime, not unlimited
workers. Graphics backend names describe accepted settings, not tested drivers.

Schema version 1 permits additional fields and features in future minor releases. Consumers
should inspect the fields they need and ignore unknown fields. Removing or changing an existing
field's meaning requires a new version. Missing features mean unsupported, not untested.

Project validation remains separate: `setcast validate` checks authored configuration and assets.
Capability reporting cannot establish that a project or machine can render successfully.
