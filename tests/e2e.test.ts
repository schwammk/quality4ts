import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropStubBins, makeStubBins } from './helpers.js';

const FIXTURE = join(__dirname, 'fixtures/canned');
const WORK = mkdtempSync(join(tmpdir(), 'quality4ts-e2e-'));
const BINS = makeStubBins(FIXTURE);
const PORT = 4577;
let child: ChildProcess;
const OUT = join(WORK, 'report.json');

beforeAll(async () => {
  child = spawn(process.execPath, [join(__dirname, '../dist/cli.js'), 'serve', '.', '--port', String(PORT), '--no-open',
    '--crap4ts-bin', BINS.crap4ts, '--dry4ts-bin', BINS.dry4ts, '--arch4ts-bin', BINS.arch4ts], { cwd: join(__dirname, 'fixtures/canned'), stdio: 'ignore' });
  await waitForServer();
  // wait for the initial scan to finish
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/report`); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server never served a report');
}, 30_000);

afterAll(() => { child.kill(); dropStubBins(BINS); rmSync(WORK, { recursive: true, force: true }); });

function waitForServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const probe = () => {
      fetch(`http://127.0.0.1:${PORT}/api/source?file=nope.ts`)
        .then((r) => (r.status === 400 || r.status === 404 || r.ok ? resolve() : retry()))
        .catch(retry);
    };
    const retry = () => (Date.now() - t0 > 15_000 ? reject(new Error('server did not start')) : setTimeout(probe, 200));
    probe();
  });
}

describe('e2e: serve + scan headless', () => {
  it('serves the report API and static client', async () => {
    const report = await (await fetch(`http://127.0.0.1:${PORT}/api/report`)).json();
    expect(report.meta.target).toBeDefined();
    expect(report.functions.length).toBeGreaterThan(0);
    const page = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    expect(page).toContain('quality4ts');
  });

  it('POST /api/scan returns a fresh dataset', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/scan`, { method: 'POST' });
    expect(res.ok).toBe(true);
  });

  it('headless scan writes a merged report file', async () => {
    const done = new Promise<number>((resolve) => {
      const p = spawn(process.execPath, [join(__dirname, '../dist/cli.js'), 'scan', '.', '--out', OUT,
        '--crap4ts-bin', BINS.crap4ts, '--dry4ts-bin', BINS.dry4ts, '--arch4ts-bin', BINS.arch4ts], { cwd: join(__dirname, 'fixtures/canned'), stdio: 'ignore' });
      p.on('close', resolve);
    });
    expect(await done).toBe(0);
    const parsed = JSON.parse(readFileSync(OUT, 'utf8'));
    expect(parsed.functions.length).toBeGreaterThan(0);
    expect(parsed.modules.length).toBeGreaterThan(0);
  });
});
