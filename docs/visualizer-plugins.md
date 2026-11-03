# External visualizer packages

The stock CLI loads visualizers from explicitly configured, already installed npm packages.
Both recorded `setcast.yaml` and `live.yaml` accept:

```yaml
plugins:
  - setcast-viz-example
visualizer:
  name: example-pulse
  gain: 1.2
```

Install the package in the project or a containing directory. Setcast resolves packages from the
configuration directory using Node package resolution; it does not search a global installation,
discover packages by naming convention, fetch packages or run an installation command. Declaring
`plugins:` executes the package's schema code in Node and its component code in Chromium. Use
packages you trust, as with other executable project dependencies.

## Package contract

A package supplies two explicit ESM exports and uses Setcast, React and Zod as peers. Publish
compiled JavaScript; TypeScript/JSX source in an installed package is not the Node schema contract.
The `/setcast` export must work in Node without React, DOM access or a renderer import.

```json
{
  "name": "setcast-viz-example",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./setcast": "./schema.js",
    "./setcast/browser": "./browser.js"
  },
  "peerDependencies": {
    "@setcast/core": "0.1.0",
    "react": ">=19",
    "zod": ">=4 <5"
  }
}
```

The default export of `schema.js` is a `VisualizerPlugin` from `@setcast/core`:

```js
import { z } from 'zod';

export default {
  apiVersion: 1,
  visualizer: {
    name: 'example-pulse',
    schema: z.strictObject({
      name: z.literal('example-pulse'),
      gain: z.number({ error: 'gain must be a number from 0 to 4.' })
        .min(0, { error: 'gain must be at least 0.' })
        .max(4, { error: 'gain must not exceed 4.' })
        .default(1),
    }),
  },
};
```

The default export of `browser.js` is the React component. Setcast registers it before starting
its renderer/player entry; the package must not call `defineVisualizer` or mutate a registry
itself. This initial contract supplies one visualizer per package. Names cannot replace built-ins
or conflict with another configured package.

```js
import { createElement } from 'react';
import { useAudioFeatures } from '@setcast/core/react';

export default function Pulse({ config }) {
  const { bass } = useAudioFeatures();
  return createElement('div', {
    className: 'example-pulse',
    style: { opacity: Math.min(1, bass * config.gain) },
  });
}
```

Supply layout and appearance through project/theme CSS. Use the existing Setcast hooks, media
wrappers and readiness contract. Motion must depend on absolute frame time, including after
backward seeks and worker changes. Parsed configuration must remain JSON-compatible and retain
the declared literal `name`. `wholeSet: true` requests the recorded envelope and omits the visualizer
from live output with a warning. `audio: false` is appropriate only when the component never reads
real-time audio or history. See [the renderer contract](theme-plugin-contract.md).

## Media and saved scenes

Declare top-level config fields that contain media files with `assets`, alongside `apiVersion`
and `visualizer`. For example, add `image: z.string().optional()` to the schema and
`assets: ['image']` to the definition. Use `Img`, `Video` or `useAsset` in the component.
The loader validates declared paths, scene saving copies the files, scene rebasing adjusts the
paths and stored-chunk exports fingerprint their contents. Omitted or null media fields are skipped.
Nested media fields and arrays of filenames are not part of this first contract.

Package-owned media should be embedded as data URIs in the component or the project's inlined
CSS. Arbitrary network requests and undeclared files are not supported dependencies for resume
or persistent caching. A readiness hold alone does not declare an asset dependency.

Saved scenes retain package names and copied media, and write a package manifest with exact
plugin versions. They do not copy executable packages or `node_modules`; install those dependencies
in the destination project before loading a transferred scene. Keep the destination lockfile.

## Workflows and changes

Configured plugins work in browser export, stills, independent preview, recorded playback and
live output. The optional Remotion adapter also includes them in exports and Studio entries.
Node validation uses an isolated catalog per project; loading one project's plugin does not make
its name available to an unrelated project.

```sh
setcast validate . --json
setcast validate . --live --json
setcast schema visualizer --project . > visualizers.schema.json
```

`schema --project` reads the recorded project's configuration to include its plugin schemas.
Plain `schema` remains independent of project files and includes the built-ins. Neither command
renders or probes media.

A recorded export bundles the plugin set needed by its root and recorded scenes. A live session
bundles its root `plugins:` list; add packages needed by recalled scenes there even if the initial
scene does not draw their visualizers. Different versions providing the same visualizer cannot
share a bundle. Adding or changing plugin code requires restarting preview/live. Invalid reloads
retain the previous project instead of pairing new props with stale JavaScript.

Package content identity and the actual compiled browser bundle participate in stored-work
identity. Unchanged plugin exports can reuse identical chunks. Plugin visualizers do not receive
the built-in announcement-text-only incremental reuse policy, because they may read arbitrary
project fields. This is not a cross-machine cache guarantee.

## Verification

The fixture under `scripts/fixtures/setcast-viz-fixture` is packed and installed by
`vp run package-smoke`. It is a test package and is not published. The check exercises schema
loading, both validation modes, browser output pixels and media, cache/resume, different plugin
sets in a shared render session, preview seeks, live/recorded player rendering and saved scenes.
The compatibility installation additionally exercises the optional Remotion renderer.
