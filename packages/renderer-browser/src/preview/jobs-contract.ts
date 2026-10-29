import type { ExportSettings, RenderProgress, RenderRuntime } from '@setcast/core';

export interface PreviewExportOptions {
  directory: string;
  settings?: ExportSettings;
}
export interface PreviewExportRequest {
  revision: number;
  first: number;
  last: number;
}
export interface PreviewExportJob extends PreviewExportRequest {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'cancelled' | 'failed';
  fps: number;
  title: string;
  filename: string;
  progress: RenderProgress | null;
  runtime: RenderRuntime[];
  error: string | null;
}
export interface PreviewExportsState {
  token: string;
  directory: string;
  jobs: PreviewExportJob[];
}
