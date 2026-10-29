import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname } from 'node:path';
import { errorMessage, SetcastError } from '@setcast/core';
import { projectAsset, serveAsset } from '../assets.ts';
import type { PreviewJobs } from './jobs.ts';

export class PreviewJobApi {
  private token = randomBytes(32).toString('hex');
  private jobs: PreviewJobs;
  constructor(jobs: PreviewJobs) {
    this.jobs = jobs;
  }
  async respond(path: string, request: IncomingMessage, response: ServerResponse) {
    if (!sameOrigin(request)) {
      response.writeHead(403).end('Open this preview address to manage exports.');
      return;
    }
    try {
      if (request.method === 'GET' || request.method === 'HEAD')
        return await this.read(path, request, response);
      if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
      }
      if (
        request.headers.origin !== `http://${request.headers.host}` ||
        request.headers['x-setcast-export'] !== this.token
      ) {
        response.writeHead(403).end('Refresh this preview before managing exports.');
        return;
      }
      await this.write(path, request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      response.writeHead(400, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          message: errorMessage(error),
          hint: error instanceof SetcastError ? error.hint : undefined,
        }),
      );
    }
  }
  private async read(path: string, request: IncomingMessage, response: ServerResponse) {
    if (path === '/exports')
      return json(
        response,
        { token: this.token, directory: this.jobs.directory, jobs: this.jobs.list() },
        request.method === 'HEAD',
      );
    const match = /^\/exports\/([a-f0-9-]{36})\/file$/.exec(path);
    if (match) return this.download(match[1]!, request, response);
    response.writeHead(404).end();
  }
  private async write(path: string, request: IncomingMessage, response: ServerResponse) {
    const body = await readBody(request);
    if (path === '/exports') return json(response, this.jobs.enqueue(body));
    const match = /^\/exports\/([a-f0-9-]{36})\/(cancel|resume)$/.exec(path);
    if (!match) {
      response.writeHead(404).end();
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
      throw new Error('Cancel and resume require an empty JSON object. Refresh preview and retry.');
    if (match[2] === 'cancel') this.jobs.cancel(match[1]!);
    else this.jobs.resume(match[1]!);
    json(response, { jobs: this.jobs.list() });
  }
  private async download(id: string, request: IncomingMessage, response: ServerResponse) {
    const file = this.jobs.completedFile(id);
    const safe = await projectAsset(dirname(file), basename(file));
    if (!safe)
      throw new Error(
        'Export file no longer belongs to this job directory. Restore the completed file before downloading.',
      );
    response.setHeader('Content-Disposition', `attachment; filename="${basename(file)}"`);
    await serveAsset(safe, request, response);
  }
}
function json(response: ServerResponse, body: unknown, head = false) {
  const encoded = JSON.stringify(body);
  response
    .writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(encoded),
    })
    .end(head ? undefined : encoded);
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new Error('Export requests require application/json. Refresh preview and retry.');
  if (Number(request.headers['content-length']) > 4096)
    throw new Error('Export request exceeds 4 KiB. Send only the selected frame range.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096)
      throw new Error('Export request exceeds 4 KiB. Send only the selected frame range.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (cause) {
    throw new Error('Invalid export request JSON. Refresh preview and retry.', { cause });
  }
}

function sameOrigin(request: IncomingMessage) {
  const origin = `http://${request.headers.host}`;
  const site = request.headers['sec-fetch-site'];
  return (
    (!request.headers.origin || request.headers.origin === origin) &&
    (!site || site === 'same-origin' || site === 'none')
  );
}
