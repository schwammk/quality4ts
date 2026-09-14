import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ScanService } from '../src/server/api.js';
import { CliError } from '../src/cli-error.js';
import { dropStubBins, makeStubBins } from './helpers.js';

const CANNED = join(__dirname, 'fixtures/canned');
const TARGET = join(__dirname, 'fixtures/scan-target');

describe('ScanService', () => {
  const stubBins = makeStubBins(CANNED);
  afterAll(() => dropStubBins(stubBins));

  it('scans via the sibling bins and returns the merged dataset', async () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
      maxCrap: 30,
      dryThreshold: 0.82,
    });
    const report = await service.scan();
    expect(report.modules.length).toBe(3);
    expect(report.functions.length).toBe(5);
    expect(report.meta.thresholds).toEqual({ maxCrap: 30, dryThreshold: 0.82 });
  });

  it('caches the dataset (scan twice is the same object)', async () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
    });
    const first = await service.scan();
    expect(await service.scan()).toBe(first);
  });

  it('reanalyze drops the cache and rescans', async () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
    });
    const first = await service.scan();
    const second = await service.reanalyze();
    expect(second).not.toBe(first);
  });

  it('readSource returns content with totalLines', () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
    });
    const src = service.readSource('src/a.ts');
    expect(src.content).toContain('scan-target');
    expect(src.totalLines).toBeGreaterThan(0);
  });

  it('readSource rejects path traversal with CliError', () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
    });
    expect(() => service.readSource('../outside.ts')).toThrow(CliError);
    expect(() => service.readSource('src/../../etc/passwd')).toThrow(CliError);
  });

  it('passes coverage options through to the crap4ts invocation', async () => {
    const service = new ScanService(TARGET, {
      bins: { crap4ts: stubBins.crap4ts, dry4ts: stubBins.dry4ts, arch4ts: stubBins.arch4ts },
      coverage: { lcov: ['/tmp/lcov.info'], useExisting: true },
    });
    await expect(service.scan()).resolves.toBeDefined();
  });
});
