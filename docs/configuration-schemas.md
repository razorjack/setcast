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

## Validation boundaries

JSON Schema checks structure, supported keys, enums, numeric bounds and representable patterns.
It cannot express every runtime refinement. For example, a timecode is structurally a string,
but its exact syntax and range are checked during normalization. Cross-field encoder rules,
finite timeline references and intervals, file existence and project containment also require
runtime loading. CSS validity, font loading, graphics support, decoder behavior and physical
input/output hardware are outside the authoring schema.

A schema-valid document can therefore still fail project loading or rendering. The schemas do
not claim to replace those checks. Schema generation fails on unsupported Zod types instead of
silently replacing them with unrestricted values. Ajv is a test-only dependency used to compile
the emitted documents and check repository examples and negative authoring cases independently.
