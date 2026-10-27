import { SetcastError } from '@setcast/core';
import { validateProject, type ValidationReport } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { parseCommandArgs } from '../args.ts';
import { rendererCapabilities, parseRendererFlag } from '../renderer.ts';

export const help = `setcast validate [dir] [--live] [--renderer remotion|browser] [--json]

Validate a project and its directly referenced scenes without launching a renderer.
  --live  read live.yaml; a missing file uses the same defaults as setcast live
  --json  print one versioned validation report on stdout, including failures
  --renderer  check recorded export settings against this renderer instead of the YAML selection

Recorded projects probe master duration and validate the finite timeline. Both modes resolve
configuration, themes, CSS assets and visualizers. Recorded export settings are checked against
the selected renderer's declared capabilities. Unreferenced scene-bank entries are not checked.
Exit status: 0 valid (warnings allowed), 2 invalid configuration/assets, 1 unexpected runtime error.
This does not decode whole-set features, test browser media readiness or qualify hardware.`;

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(
    argv,
    { live: { type: 'boolean' }, json: { type: 'boolean' }, renderer: { type: 'string' } },
    help,
  );
  if (positionals.length > 1) throw new SetcastError('validate takes one project directory.', help);
  if (values.live && values.renderer !== undefined)
    throw new SetcastError(
      '--renderer applies to recorded export settings, not live output.',
      help,
    );
  const report = await validateProject(positionals[0] ?? '.', {
    kind: values.live ? 'live' : 'project',
    themes,
    renderer: parseRendererFlag(values.renderer),
    rendererCapabilities,
  });
  if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printReport(report);
  return report.exitCode;
}

function printReport(report: ValidationReport) {
  process.stdout.write(`${report.valid ? 'Valid' : 'Invalid'} ${report.kind}: ${report.root}\n`);
  if (report.renderer)
    process.stdout.write(
      `  renderer: ${report.renderer.name}${report.renderer.checked ? ' (capabilities checked)' : ' (capabilities not checked)'}\n`,
    );
  for (const document of report.documents) {
    const summary = document.summary;
    process.stdout.write(
      `  ${document.file}${document.usesDefaults ? ' (defaults; file absent)' : ''}: ${summary ? `${summary.width}×${summary.height} @ ${summary.fps} fps, ${summary.theme}` : 'failed to load'}\n`,
    );
  }
  for (const diagnostic of report.diagnostics) {
    const location = `${diagnostic.file}${diagnostic.path ? `:${diagnostic.path}` : ''}`;
    process.stdout.write(`${diagnostic.level}: ${location}: ${diagnostic.message}\n`);
    if (diagnostic.hint) process.stdout.write(`  ${diagnostic.hint}\n`);
  }
}
