import {
  CONFIGURATION_SCHEMA_KINDS,
  configurationSchema,
  SetcastError,
  type ConfigurationSchemaKind,
} from '@setcast/core';
import { parseCommandArgs } from '../args.ts';

export const help = `setcast schema [project|live|visualizer|venue|test-pattern|midi]

Print a JSON Schema for authoring configuration (default: project).
Output is draft-2020-12 JSON on stdout. Generate a local file for editor association, e.g.
  setcast schema live > live.schema.json

Schemas come from this installed version and its registered visualizers. They describe input
before normalization. Use setcast validate for runtime configuration, timeline and asset checks.
No renderer, server, media probe or network request is started.`;

export async function run(argv: string[]): Promise<void> {
  const { positionals } = parseCommandArgs(argv, {}, help);
  const kind = positionals[0] ?? 'project';
  if (
    positionals.length > 1 ||
    !CONFIGURATION_SCHEMA_KINDS.includes(kind as ConfigurationSchemaKind)
  )
    throw new SetcastError(`Unknown schema selection "${positionals.join(' ')}".`, help);
  process.stdout.write(
    `${JSON.stringify(configurationSchema(kind as ConfigurationSchemaKind), null, 2)}\n`,
  );
}
