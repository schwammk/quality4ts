import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScanService } from '../src/server/api.js';
import { startServer } from '../src/server/server.js';
import { dropStubBins, makeStubBins } from './helpers.js';

const CANNED = join(__dirname, 'fixtures/canned');
const TARGET = join(__dirname, 'fixtures/scan-target');

describe('startServer', () => {
  const stubBins = makeStubBins(CANNED);
  const service = new ScanService(TARGET, {
    bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
  });
  let base = '';
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startServer(service, { port: 0 });
    base = `http://127.0.0.1:${server.port}`;
    close = server.close;
  });
  afterAll(async () => {
    await close();
    dropStubBins(stubBins);
  });

  it('GET /api/report serves the merged dataset', async () => {
    const res = await fetch(`${base}/api/report`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modules.length).toBe(3);
    expect(body.architecture.architecture.graph.nodes.length).toBe(3);
  });

  it('POST /api/scan rescan returns a fresh dataset', async () => {
    const first = await (await fetch(`${base}/api/report`)).json();
    const res = await fetch(`${base}/api/scan`, { method: 'POST' });
    expect(res.status).toBe(200);
    const second = await res.json();
    expect(second.functions.length).toBe(first.functions.length);
    expect(second.modules.length).toBe(3);
  });

  it('GET /api/source returns file content', async () => {
    const res = await fetch(`${base}/api/source?file=src/a.ts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain('scan-target');
    expect(typeof body.totalLines).toBe('number');
  });

  it('GET /api/source rejects traversal with 400', async () => {
    const res = await fetch(`${base}/api/source?file=../outside.ts`);
    expect(res.status).toBe(400);
  });

  it('unknown static path gets 404 with a build hint', async () => {
    const res = await fetch(`${base}/definitely-not-here.js`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('npm run build');
  });
});
