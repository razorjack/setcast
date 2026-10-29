import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  errorMessage,
  framesWithinMix,
  SetcastError,
  type ExportSettings,
  type RenderOptions,
  type ResolvedProject,
} from '@setcast/core';
import { render, withRenderSession } from '../export/index.ts';
import { exportEncoding } from '../export/encoding.ts';
import { validateGraphicsBackend } from '../export/graphics.ts';
import { projectAssets } from '../export/identity.ts';
import type { PreviewRevision } from './server.ts';
import type {
  PreviewExportJob,
  PreviewExportOptions,
  PreviewExportRequest,
} from './jobs-contract.ts';

interface Job {
  report: PreviewExportJob;
  project: ResolvedProject;
  settings: ExportSettings;
  controller: AbortController;
  out?: string;
}

export class PreviewJobs {
  readonly directory: string;
  private jobs: Job[] = [];
  private draining: Promise<void> | undefined;
  private closed = false;
  private revision: PreviewRevision;
  private options: PreviewExportOptions & { projectDir: string };
  private exporter: Pick<import('@setcast/core').Exporter, 'render' | 'withRenderSession'>;
  constructor(
    revision: PreviewRevision,
    options: PreviewExportOptions & { projectDir: string },
    exporter = { render, withRenderSession },
  ) {
    this.revision = revision;
    this.options = options;
    this.exporter = exporter;
    if (typeof options.directory !== 'string' || !options.directory.trim())
      throw new SetcastError(
        'Preview export directory is empty.',
        'Pass a dedicated output directory when enabling preview exports.',
      );
    this.directory = resolve(options.directory);
  }
  list() {
    return this.jobs.map(({ report }) => structuredClone(report));
  }
  enqueue(body: unknown): PreviewExportJob {
    const request = parseRequest(body, this.revision);
    this.accepting();
    if (this.jobs.length >= 20)
      throw new Error(
        'This preview has 20 export jobs. Restart preview to start a new queue; saved files remain available.',
      );
    const settings = structuredClone(this.options.settings ?? {});
    exportEncoding({ ...settings, projectDir: '', out: 'export.mp4' });
    validateGraphicsBackend(settings.gl);
    projectAssets(this.revision.project);
    const id = randomUUID();
    const report: PreviewExportJob = {
      ...request,
      id,
      status: 'queued',
      fps: this.revision.project.fps,
      title: this.revision.project.title,
      filename: `${id}/frames-${request.first}-${request.last}.mp4`,
      progress: null,
      runtime: [],
      error: null,
    };
    this.jobs.push({
      report,
      project: structuredClone(this.revision.project),
      settings,
      controller: new AbortController(),
    });
    this.pump();
    return structuredClone(report);
  }
  cancel(id: string) {
    const job = this.find(id);
    if (job.report.status !== 'queued' && job.report.status !== 'running') return;
    job.controller.abort(new Error('Export cancelled. Resume this job to reuse completed chunks.'));
    if (job.report.status === 'queued') job.report.status = 'cancelled';
  }
  resume(id: string) {
    const job = this.find(id);
    this.accepting();
    if (!['cancelled', 'failed'].includes(job.report.status))
      throw new Error('Only cancelled or failed exports can resume. Choose another job.');
    if (job.report.revision !== this.revision.revision || this.revision.error)
      throw new Error(
        'The project changed since this job was queued. Create a new export from the current preview.',
      );
    job.controller = new AbortController();
    Object.assign(job.report, { status: 'queued', error: null, progress: null, runtime: [] });
    this.pump();
  }
  invalidate(message: string) {
    for (const job of this.jobs) {
      if (job.report.status !== 'queued' && job.report.status !== 'running') continue;
      job.controller.abort(new Error(message));
      if (job.report.status === 'queued')
        Object.assign(job.report, { status: 'cancelled', error: message });
    }
  }
  updateSettings(settings: ExportSettings | undefined) {
    this.options = { ...this.options, settings };
  }
  async close() {
    this.closed = true;
    this.invalidate('Preview stopped. Completed outputs and resume checkpoints remain on disk.');
    await this.draining;
  }
  completedFile(id: string) {
    const job = this.find(id);
    if (job.report.status !== 'complete' || !job.out)
      throw new Error('This export is not complete. Wait for it to finish before downloading.');
    return job.out;
  }
  private find(id: string) {
    const job = this.jobs.find(({ report }) => report.id === id);
    if (!job) throw new Error('Unknown preview export ID. Refresh the export queue.');
    return job;
  }
  private accepting() {
    if (this.closed) throw new Error('Preview is stopping. Restart preview to export.');
    if (this.revision.error)
      throw new Error(
        'The project has invalid edits. Fix the reported project error before exporting.',
      );
    if (this.jobs.filter(({ report }) => report.status === 'queued').length >= 4)
      throw new Error('Four exports are waiting. Wait for one to start or cancel a queued job.');
  }
  private pump() {
    if (this.draining || this.closed) return;
    this.draining = this.drain()
      .catch((error: unknown) => {
        this.invalidate(
          `Export session failed: ${errorMessage(error)}. Restart preview and retry.`,
        );
      })
      .finally(() => {
        this.draining = undefined;
        if (this.jobs.some(({ report }) => report.status === 'queued')) this.pump();
      });
  }
  private async drain() {
    await this.exporter.withRenderSession(async () => {
      let job: Job | undefined;
      while (!this.closed && (job = this.jobs.find(({ report }) => report.status === 'queued')))
        await this.run(job);
    });
  }
  private async run(job: Job) {
    job.report.status = 'running';
    try {
      if (job.report.revision !== this.revision.revision || this.revision.error)
        throw new Error('The project changed. Create a new export from the current preview.');
      job.out ??= await this.reserveOutput(job.report);
      job.controller.signal.throwIfAborted();
      const options: RenderOptions = {
        ...job.settings,
        projectDir: this.options.projectDir,
        out: job.out,
        range: [job.report.first / job.project.fps, (job.report.last + 1) / job.project.fps],
        resume: true,
        signal: job.controller.signal,
        onProgress: (progress) => {
          job.report.progress = { ...job.report.progress, ...progress };
        },
        onRuntime: (event) => {
          if (job.report.runtime.length < 16) job.report.runtime.push(event);
        },
      };
      await this.exporter.render(job.project, options);
      job.report.status = 'complete';
    } catch (error) {
      job.report.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      const cause = job.controller.signal.aborted ? job.controller.signal.reason : error;
      job.report.error =
        errorMessage(cause) + (cause instanceof SetcastError ? ` ${cause.hint}` : '');
    }
  }
  private async reserveOutput(report: PreviewExportJob) {
    try {
      await mkdir(this.directory, { recursive: true });
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'ENOTDIR', 'EACCES', 'EPERM', 'ENOSPC'].includes(code ?? '')) throw cause;
      throw new SetcastError(
        `Cannot create preview output directory ${this.directory} (${code}).`,
        'Use a writable directory with enough disk space and remove conflicting files, then retry.',
        { cause },
      );
    }
    if (!(await lstat(this.directory)).isDirectory())
      throw new Error(
        'Preview export directory must be a regular directory. Remove the conflicting file or link and retry.',
      );
    const root = await realpath(this.directory);
    await mkdir(join(root, report.id));
    return join(root, report.filename);
  }
}

function parseRequest(body: unknown, state: PreviewRevision): PreviewExportRequest {
  const request = body as Partial<PreviewExportRequest> | null;
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !== 'first,last,revision'
  )
    throw new Error(
      'Export requests require only revision, first and last integer frames. Refresh preview and try again.',
    );
  if (request.revision !== state.revision)
    throw new Error('The preview revision is stale. Wait for project reload, then export again.');
  const { first, last } = request;
  const count = framesWithinMix(state.project.mix.duration, state.project.fps);
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first! < 0 ||
    last! < first! ||
    last! >= count
  )
    throw new Error(
      `Invalid export range ${first}-${last}. Choose inclusive frames from 0 to ${count - 1}.`,
    );
  return { revision: state.revision, first: first!, last: last! };
}
