# Configure and extend Setcast

Setcast shares a scene model across recorded projects, live input, browser playback and two
exporters. Start with YAML and CSS when customizing a show. Use the core APIs when embedding
Setcast or building a visualizer into a host. Remotion remains the default exporter;
`renderer: browser` opts into the independent exporter.

This guide maps the implemented contracts. It does not imply automatic discovery of installed
JavaScript plugins or a hosted configuration service.

## Configuration before code

A recorded project uses `setcast.yaml`; live input uses `live.yaml`. Assets belong inside the
project directory. A custom `theme: ./theme.css`, appended `css: ./overrides.css`, visualizer
blocks and modulation routes cover most appearance changes without JavaScript.

Generate editor schemas from the installed version and validate a project before opening output:

```sh
setcast schema live > live.schema.json
setcast validate examples/live-projection --live --json
```

[Configuration schemas](configuration-schemas.md) describe the commands, structured validation
report and reusable `configurationSchema` / `validateProject` APIs. JSON Schema covers authoring
structure; project loading also checks references, assets and finite timelines. Rendering still
needs working fonts, decoders and graphics. Regenerate editor schemas after upgrading Setcast.

Project YAML has no `version` or `$schema` key. Portable venue, camera-pattern and MIDI documents
have their own versioned envelopes. Validation reports and journals also have separate contracts;
a version number from one document does not describe another.

| What to configure | Contract and guide |
| --- | --- |
| Credits, participation, sections and cues | [Finite DJ mix model](dj-mix-model.md) |
| Appearance, layout and audio response | [Theme/component CSS contract](theme-plugin-contract.md) |
| Logo, identity, rotating messages and announcements | [Branding](branding.md) |
| Live input routing and replay journal | [Live input](live-input.md) |
| Intensity, brightness, blackout and tempo | [Live performance](live-performance.md) |
| Scene progression and energy matching | [Live scene progression](live-performance.md#automatic-scene-progression) |
| Assisted tempo estimates and explicit adoption | [Live beat tracking](live-beat-tracking.md) |
| Controller assignments and portable profiles | [MIDI controls](midi-controls.md) |
| One-projector geometry and masks | [Projector setup](projector-setup.md) |
| Framing, grayscale, detail and motion patterns | [Camera setup](camera-setup.md) |
| Independent offline export | [Browser renderer](browser-renderer.md) |

## Keep appearance, setup and performance distinct

Scene recall changes the prepared appearance after its assets are ready. Branding belongs to
that appearance, so recalling a scene restores its identity and message settings. Output setup
belongs to the current session: projector geometry, camera patterns and MIDI assignments must
not change because a scene was recalled. Sequence control and beat-tracker setup are also
session concerns.

Saved scenes omit `projection`, `testPattern`, `midi`, `sequence` and `beatTracking`. They contain
resolved theme CSS and copied assets. They can retain input, tempo and performance values as
startup defaults when opened as standalone projects. Recalling one inside a running session
preserves the session's input and active performance state. Do not interpret every key in a
saved `live.yaml` as an instruction to reconfigure the running capture device.

A journal records supported actions on the capture sample clock and includes scene snapshots.
A replay combines that metadata with a separately recorded master. It does not record audio,
physical projector correction, MIDI device setup or camera calibration. See the journal format
and timing limits in [live-input.md](live-input.md).

Portable setup profiles configure existing capabilities. Importing one does not grant device
access or start capture. A configured MIDI profile also does not overwrite the browser's saved
profile; explicit export preserves changes made during that session.

## Package boundaries for hosts

| Entry point | Owns |
| --- | --- |
| `@setcast/core` | Pure schemas, timeline, audio/beat math, modulation, registries and configuration contracts |
| `@setcast/core/react` | Frame context, hooks, media wrappers, stage/components and visualizer registration |
| `@setcast/core/media` | Browser/Node media probes without React or Node-only imports |
| `@setcast/core/node` | Project loading, asset resolution, validation, analysis and scene persistence |
| `@setcast/renderer-remotion` | Remotion-specific rendering and readiness bindings |
| `@setcast/renderer-browser` | Recorded/live players, independent preview and offline export |

Only the Remotion adapter imports Remotion. Core, themes and visualizer code use Setcast-owned
contracts. Pure APIs do not open a browser or select a device. Node loaders return resolved data;
browser components consume it through the frame and renderer bindings.

`RenderFrame` owns frame number, FPS, absolute time, audio features, timeline state, composition
and modulation. Read it through Setcast hooks. Motion must be reproducible after backward seeks,
out-of-order export jobs and scene remounts. Do not derive scene motion from wall-clock timers,
CSS animation progress or mutable particle history. A stateful effect needs an explicit replay
or checkpoint design before it can satisfy this contract.

Use Setcast `Img`, `Video`, `useAsset` and `useFontsReady` for media readiness. Renderer bindings
hold incomplete frames until assets are ready. The same principle applies to GPU context
restoration: resource recovery may wait on wall time, but the restored picture uses the current
explicit frame time. Operational diagnostics belong in the host UI, outside the scene.

## Add a visualizer to an embedding host

A visualizer has a strict Zod configuration schema and a React component. Register its schema in
the host that loads or validates projects, and its component in every browser bundle that draws
it. These are separate JavaScript runtimes. Registering a schema in Node cannot register the
component in a browser tab.

```ts
// Shared contract, imported before project loading or schema generation.
import { z } from 'zod';
import { visualizers } from '@setcast/core';

export const PulseSchema = z.strictObject({
  name: z.literal('my-pulse'),
  gain: z.number().min(0).max(4).default(1),
});
export type PulseConfig = z.infer<typeof PulseSchema>;
visualizers.add({ name: 'my-pulse', schema: PulseSchema });
```

```tsx
// Browser registration, included in each renderer entry bundle by the host.
import { defineVisualizer, useAudioFeatures } from '@setcast/core/react';
import { PulseSchema, type PulseConfig } from './pulse-config.js';

function Pulse({ config }: { config: PulseConfig }) {
  const { bass } = useAudioFeatures();
  return <div className="my-pulse" style={{ opacity: Math.min(1, bass * config.gain) }} />;
}

defineVisualizer({ name: 'my-pulse', schema: PulseSchema, component: Pulse });
```

Give `.my-pulse` layout and appearance in CSS, then author
`visualizer: { name: my-pulse, gain: 1.2 }`. The host's generated visualizer schema includes
registered schemas. `defineVisualizer` completes an existing schema-only registration; duplicate
complete registrations fail. Keep the schema module single-instanced within each bundle.

Keep parsed visualizer configuration JSON-compatible: loaders pass resolved project data across
process and browser boundaries. Media readiness is separate from asset discovery. The built-in
loader, scene saver and resume fingerprint know core asset fields; they do not scan arbitrary
plugin configuration keys for file paths. A host adding plugin files must integrate validation,
serving, copying/rebasing and content fingerprints, or leave unsupported persistence/resume paths
disabled. Calling `useAsset` only provides readiness, not those asset-lifecycle guarantees.

For GPU effects, use the public `ShaderCanvas`, `Shader<C>` and `GpuCanvasConfigSchema`.
[GPU visualizer authoring](gpu-visualizer.md#shared-canvas-for-visualizer-authors) documents bounded
buffers, premultiplied output, absolute-time uniforms, context recovery and a complete shader
example. A registered visualizer's schema also needs its literal `name` field.

The stock CLI does not yet load arbitrary `setcast-viz-*` packages or extra entry modules from
YAML. Today custom JavaScript requires an embedding host or a source build that includes both
registrations. CSS-path themes work with the stock CLI. A future plugin loader needs explicit
package/version resolution, both runtime registrations, packaging checks and compatibility rules;
naming a package alone is not that capability.

## Verify a platform extension

Validate the smallest relevant contract first, then exercise the real renderer or device path.
A schema test cannot establish visual output; a still cannot establish out-of-order frame
identity or sustained live behavior.

- Visualizers: arbitrary seeks, repeated frames, concurrent workers, portrait, readiness and
  both exporters. GPU effects also need context loss, restoration and software rendering.
- Live controls: capture ownership, queued input, scene recall, output protection and journal
  replay. Configuration import must reject invalid documents without partially applying them.
- Configuration tools: generated schema and runtime validation should agree where JSON Schema
  can represent the rule. Keep semantic/path checks in the loaders.
- Performance claims: record workload, revision, browser/backend, dimensions, resolution and
  concurrent load. Use [endurance tooling](endurance.md) and [beat evaluation](beat-evaluation.md)
  for reproducible evidence. Synthetic audio and browser metrics do not qualify physical mixers,
  projector presentation or camera shutter behavior.

The [roadmap](rendering-and-live-roadmap.md#next-milestones) separates implemented contracts from
remaining platform and hardware work.
