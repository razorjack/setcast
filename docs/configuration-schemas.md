# Configuration schemas for editors and tools

Setcast generates JSON Schemas from the same input contracts used by its loaders. Use them for
field completion, defaults, allowed values and structural diagnostics while editing YAML or
building configuration tools. Generation uses the installed core version and registered visualizer
schemas. It does not probe media, load React, open a server or contact a schema service.

```sh
setcast schema project > setcast.schema.json
setcast schema live > live.schema.json
```

For a YAML editor using the [YAML language server](https://github.com/redhat-developer/yaml-language-server#associating-schemas), put this comment at the top of `setcast.yaml`:

```yaml
# yaml-language-server: $schema=./setcast.schema.json
audio: assets/mix.wav
theme: sterile-tech
visualizer: { name: tunnel, resolution: 0.5, recoverySeconds: 5 }
```

Use `./live.schema.json` in `live.yaml`. The comment is ignored by Setcast. Do not add a `$schema`
configuration key: project schemas are strict and reject unknown settings. Other editors can
associate a local schema file with the YAML filename through their settings. Regenerate the files
after upgrading Setcast; these are local artifacts, not URLs for a hosted schema service.

## Available documents

| Command | Describes |
| --- | --- |
| `setcast schema` or `setcast schema project` | Recorded `setcast.yaml` input |
| `setcast schema live` | Live `live.yaml` input, also used by saved scene directories |
| `setcast schema visualizer` | One visualizer block or an ordered list of blocks |
| `setcast schema venue` | Version 1 portable venue document |
| `setcast schema test-pattern` | Version 1 portable camera test-pattern document |
| `setcast schema midi` | Version 1 portable MIDI mapping profile |

Output is one draft-2020-12 JSON document on stdout. Errors use stderr and exit code 2. The command
does not read a project, so it works in an empty directory. Redirection is explicit; Setcast does
not create editor settings or rewrite authored files. Schema defaults describe runtime defaults;
external tools should not insert them automatically because omitted values can inherit theme
choices or select an encoding profile.

Visualizer alternatives come from the core registry, including per-visualizer bounds and strict
keys. Omitted `name` means spectrum, exactly as runtime dispatch does. An omitted `visualizer`
uses the theme default; an empty list disables visualizers. The CLI includes the visualizers in
its installed build. The schema API includes additional schemas already registered by an embedding
host; this does not add plugin package discovery or execute modules named by YAML.

## Programmatic API

```ts
import { configurationSchema, CONFIGURATION_SCHEMA_KINDS } from '@setcast/core';

const schema = configurationSchema('live');
const kinds = CONFIGURATION_SCHEMA_KINDS;
```

`ConfigurationSchemaKind` is the exported union of supported kinds. The function returns a fresh
JSON-compatible document and does not retain generated schemas across registry changes. It uses
Zod's [input JSON Schema conversion](https://zod.dev/json-schema#io), so timecode strings,
shorthand booleans and omitted defaults remain authoring inputs rather than normalized output.

## Validate a project before rendering

```sh
setcast validate path/to/recorded-project
setcast validate path/to/live-project --live
setcast validate path/to/project --json > validation.json
setcast validate path/to/recorded-project --renderer browser
```

Validation uses the same project loaders as playback/export. Recorded mode probes master duration
and validates finite timeline references and intervals. Both modes resolve schemas, theme/CSS
files, artwork/logo paths and visualizer settings. It checks directly referenced recorded scenes
or the root live sequence's presets, deduplicating repeated directories. Scene warnings are included.
It does not inspect unreferenced scene-bank entries or recursively activate a recalled scene's own
sequence settings. A missing `live.yaml` uses defaults, as `setcast live` does, and the report states
that explicitly. A missing `setcast.yaml` fails.

Recorded CLI validation also checks export settings against the selected adapter's declared
capabilities. `--renderer browser` overrides the YAML selection for this check without writing it.
Unsupported graphics backends, serial encoding or required hardware encoding are errors at their
`output.*` paths. Browser `hardwareAcceleration: if-possible` is a warning because the CLI falls
back to software. Renderer checks do not run for live projects or recalled live scene settings;
`--live --renderer` is a usage error. This is not a machine check: use `setcast doctor` separately.

No renderer, local server, full audio-feature decode or hardware encoder is started. Duration
probing can scan media packets when container metadata is insufficient. Validation does not
modify authored files. Loader failures stop that document's checks; diagnostics are not an
exhaustive list of every possible error in an invalid project. Successfully loaded roots then
check their direct scene references independently.

Exit statuses are 0 for valid projects (warnings allowed), 2 for configuration/assets that need
correction, and 1 for unexpected runtime or filesystem failures. With `--json`, stdout contains
one versioned report on success or project-validation failure, and stderr stays empty. Invalid
command arguments use the normal CLI usage error on stderr and do not produce a project report.

```json
{
  "version": 1,
  "root": "/projects/session",
  "kind": "live",
  "valid": false,
  "exitCode": 2,
  "renderer": null,
  "documents": [{
    "file": "live.yaml", "kind": "live", "valid": false,
    "usesDefaults": false, "summary": null
  }],
  "diagnostics": [{
    "level": "error", "code": "configuration", "file": "live.yaml",
    "path": "output.fps", "message": "fps must be 24, 25, 30, 50 or 60."
  }]
}
```

`renderer` is `{ name, checked }` after a recorded project loads, or null for live projects and
failures before renderer selection. `checked` records whether adapter capabilities were supplied
and checked. `documents` records attempted project/scene loads. Successful summaries include title, theme,
composition width/height/FPS, visualizer names and recorded duration (null live). `file` uses
forward slashes relative to `root`, preserving authored scene paths even when the root is a
filesystem alias. Diagnostic `path` is a configuration key path, or empty for a document-level
error. Optional `hint` suggests a correction; `context` preserves a loader's source label such
as `mix timeline`. Codes are `configuration`, `project`, `io`, `runtime`, `project-warning` and `renderer`.
Warnings do not change `valid` or the exit code. A host can apply a stricter warning policy to
the structured report without parsing terminal prose.

The reusable Node API returns the same report:

```ts
import { validateProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';

const report = await validateProject('/projects/session', { kind: 'live', themes });
```

`ValidationReport`, `ValidationOptions`, `ValidationKind`, `ValidationDocument` and
`ValidationDiagnostic` are exported types from core/node. Supply the host's theme catalog;
CSS-path themes work without a catalog. Recorded validation uses core's media probe unless a
host supplies `probeDuration(audio, root)`. Invalid API options are programmer errors; project
loading failures become diagnostics. Report version 1 is separate from project configuration
and portable setup-document versions.

Core does not import renderer adapters. Programmatic callers opt into compatibility checks by
providing `rendererCapabilities(name)`, returning the selected adapter's lightweight descriptor.
Without it, the report records the configured renderer with `checked: false`. The optional
`renderer` override requires this resolver and recorded mode. The CLI always supplies the resolver.

```ts
const report = await validateProject('/projects/session', {
  themes,
  renderer: 'browser',
  rendererCapabilities: async (name) => name === 'browser'
    ? (await import('@setcast/renderer-browser/capabilities')).capabilities
    : (await import('@setcast/renderer-remotion/capabilities')).capabilities,
});
```

Hosts assembling export requests directly can call the pure
`rendererCompatibility(capabilities, options)` from core. It returns all support issues for
video export, graphics, parallel encoding, concurrency, resume and hardware encoding. Paths are
relative to the supplied render options. It does not validate every encoding field, apply fallback,
probe runtime limits or change options. The browser adapter's direct render API still requires
`hardwareAcceleration: disable`; the CLI owns `if-possible` fallback. Use `OutputSchema` for
configuration validation and diagnostics for runtime availability.

## Validation boundaries

JSON Schema checks structure, supported keys, enums, numeric bounds and representable patterns.
It cannot express every runtime refinement. For example, a timecode is structurally a string,
but its exact syntax and range are checked during normalization. Cross-field encoder rules,
finite timeline references and intervals, file existence and project containment also require
runtime loading, available through `setcast validate`. CSS validity, font loading, graphics support, decoder behavior and physical
input/output hardware are outside the authoring schema.

A schema-valid document can therefore still fail project loading or rendering. The schemas do
not claim to replace those checks. Schema generation fails on unsupported Zod types instead of
silently replacing them with unrestricted values. Ajv is a test-only dependency used to compile
the emitted documents and check repository examples and negative authoring cases independently.
