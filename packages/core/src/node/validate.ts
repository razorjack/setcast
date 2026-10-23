import { access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { ResolvedLiveProject, ResolvedProject } from '../project.ts';
import { loadProject, type LoadOptions } from './project.ts';
import { loadLiveProject } from './live.ts';
import { probeAudio } from './media.ts';
import { sceneDirectory } from './copy-scenes.ts';
import { validationFailure } from './validation-report.ts';
import { SetcastError } from '../errors.ts';

export type ValidationKind = 'project' | 'live';
export interface ValidationDiagnostic {
  level: 'error' | 'warning';
  code: 'configuration' | 'project' | 'io' | 'runtime' | 'project-warning';
  file: string;
  path: string;
  message: string;
  hint?: string;
  context?: string;
}
export interface ValidationDocument {
  file: string;
  kind: ValidationKind;
  valid: boolean;
  usesDefaults: boolean;
  summary: {
    title: string;
    theme: string;
    width: number;
    height: number;
    fps: number;
    durationSeconds: number | null;
    visualizers: string[];
  } | null;
}
export interface ValidationReport {
  version: 1;
  root: string;
  kind: ValidationKind;
  valid: boolean;
  exitCode: 0 | 1 | 2;
  documents: ValidationDocument[];
  diagnostics: ValidationDiagnostic[];
}
export interface ValidationOptions extends Pick<LoadOptions, 'themes' | 'probeDuration'> {
  kind?: ValidationKind;
}

/** Load authored projects and direct scene references, without rendering or whole-set analysis. */
export async function validateProject(
  directory: string,
  options: ValidationOptions = {},
): Promise<ValidationReport> {
  const root = resolve(directory);
  const kind = options.kind ?? 'project';
  if (kind !== 'project' && kind !== 'live')
    throw new SetcastError(`Unknown validation kind "${String(kind)}".`, 'Use project or live.');
  const report: ValidationReport = {
    version: 1,
    root,
    kind,
    valid: true,
    exitCode: 0,
    documents: [],
    diagnostics: [],
  };
  const session = new ValidationSession(report, options);
  const references = await session.check(root, kind);
  const visited = new Set<string>();
  for (const preset of references) {
    try {
      const dir = await sceneDirectory(root, preset);
      if (visited.has(dir)) continue;
      visited.add(dir);
      await session.check(dir, 'live', preset);
    } catch (error) {
      session.fail(error, join(preset, 'live.yaml'));
    }
  }
  return report;
}

class ValidationSession {
  private report: ValidationReport;
  private options: ValidationOptions;
  constructor(report: ValidationReport, options: ValidationOptions) {
    this.report = report;
    this.options = options;
  }

  async check(directory: string, kind: ValidationKind, prefix = ''): Promise<string[]> {
    const filename = kind === 'live' ? 'live.yaml' : 'setcast.yaml';
    const file = portable(join(prefix, filename));
    const document: ValidationDocument = {
      file,
      kind,
      valid: false,
      usesDefaults: false,
      summary: null,
    };
    this.report.documents.push(document);
    try {
      document.usesDefaults = kind === 'live' && !(await exists(join(directory, filename)));
      const { project, warnings, references } = await this.load(directory, kind);
      document.valid = true;
      document.summary = summarize(project);
      this.report.diagnostics.push(
        ...warnings.map((message): ValidationDiagnostic => ({
          level: 'warning',
          code: 'project-warning',
          file,
          path: '',
          message,
        })),
      );
      return references;
    } catch (error) {
      this.fail(error, file);
      return [];
    }
  }

  private async load(directory: string, kind: ValidationKind) {
    if (kind === 'live') {
      const loaded = await loadLiveProject(directory, { themes: this.options.themes });
      return {
        ...loaded,
        references: loaded.project.live.sequence?.scenes.map((scene) => scene.preset) ?? [],
      };
    }
    const loaded = await loadProject(directory, {
      ...this.options,
      probeDuration: this.options.probeDuration ?? ((audio, root) => probeAudio({ audio }, root)),
    });
    return { ...loaded, references: loaded.config.scenes?.map((scene) => scene.preset) ?? [] };
  }

  fail(error: unknown, file: string) {
    const failure = validationFailure(error, portable(file));
    this.report.valid = false;
    if (this.report.exitCode !== 1) this.report.exitCode = failure.exitCode;
    this.report.diagnostics.push(...failure.diagnostics);
  }
}

function summarize(
  project: ResolvedProject | ResolvedLiveProject,
): NonNullable<ValidationDocument['summary']> {
  return {
    title: project.title,
    theme: project.theme,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationSeconds: project.mix ? project.mix.duration / 1_000_000 : null,
    visualizers: project.visualizers.map((visualizer) => visualizer.name),
  };
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
const portable = (path: string) => path.split(sep).join('/');
