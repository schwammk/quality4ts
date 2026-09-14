import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanService } from './api.js';
import { CliError } from '../cli-error.js';

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'client');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function serveStatic(res: ServerResponse, relPath: string): Promise<boolean> {
  const file = join(CLIENT_DIR, relPath === '/' ? 'index.html' : relPath.slice(1));
  try {
    const s = await stat(file);
    if (!s.isFile()) return false;
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function handle(service: ScanService, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (path === '/api/report' && req.method === 'GET') {
    sendJson(res, 200, await service.scan());
    return;
  }
  if (path === '/api/scan' && req.method === 'POST') {
    for await (const _ of req) void _; // drain request body
    sendJson(res, 200, await service.reanalyze());
    return;
  }
  if (path === '/api/source' && req.method === 'GET') {
    const file = url.searchParams.get('file');
    if (!file) throw new CliError('missing ?file= parameter');
    sendJson(res, 200, service.readSource(file));
    return;
  }
  if (req.method === 'GET') {
    if (await serveStatic(res, path)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found — client assets are served from dist/client; run `npm run build` first');
    return;
  }
  res.writeHead(405, { 'content-type': 'text/plain' });
  res.end('method not allowed');
}

export async function startServer(service: ScanService, options: { port?: number } = {}): Promise<{ port: number; close(): Promise<void> }> {
  const server = createServer((req, res) => {
    handle(service, req, res).catch((e: unknown) => {
      if (res.headersSent) return;
      if (e instanceof CliError) sendJson(res, 400, { error: e.message });
      else sendJson(res, 500, { error: String((e as Error).message ?? e) });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4174, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 4174;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
