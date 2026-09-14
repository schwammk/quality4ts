import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/merge/report.js';

const canned = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures/canned', name), 'utf8'));

const INPUT = {
  target: '/tgt',
  thresholds: { maxCrap: 30, dryThreshold: 0.82 },
  architectureRaw: canned('canned-arch.json'),
  crapRaw: canned('canned-crap.json'),
  dryRaw: canned('canned-dry.json'),
  generatedAt: '2026-09-14T00:00:00.000Z',
};

describe('buildReport', () => {
  const report = buildReport(INPUT);

  it('assembles meta with passthrough thresholds and null tool versions', () => {
    expect(report.meta).toEqual({
      generatedAt: '2026-09-14T00:00:00.000Z',
      target: '/tgt',
      thresholds: { maxCrap: 30, dryThreshold: 0.82 },
      tools: { arch4ts: null, crap4ts: null, dry4ts: null },
    });
  });

  it('passes the architecture through untouched', () => {
    expect(report.architecture.architecture.graph.nodes).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(report.architecture.layering).toEqual({ layers: [] });
  });

  it('carries all five functions with dupes attached where they align', () => {
    expect(report.functions.length).toBe(5);
    const dupA = report.functions.find((f) => f.file === 'src/b.ts' && f.name === 'dupA')!;
    expect(dupA.dupes).toEqual([{ otherFile: 'src/a.ts', otherName: 'dup2', otherStartLine: 12, score: 1 }]);
    const b = report.functions.find((f) => f.file === 'src/a.ts' && f.name === 'b')!;
    expect(b.dupes).toEqual([]);
  });

  it('keeps unmatched pairs in duplicates only', () => {
    expect(report.duplicates.length).toBe(2);
    expect(report.duplicates[1].left.file).toBe('tests/a.test.ts');
  });

  it('rolls up modules with bands, worstCrap, dupePairs, abstract', () => {
    expect(report.modules).toEqual([
      { module: 'src/a.ts', sourceFiles: ['src/a.ts'], functionCount: 2, worstCrap: 65, bands: { low: 1, moderate: 0, high: 1, unknown: 0 }, dupePairs: 1, abstract: false },
      { module: 'src/b.ts', sourceFiles: ['src/b.ts'], functionCount: 1, worstCrap: null, bands: { low: 0, moderate: 0, high: 0, unknown: 1 }, dupePairs: 1, abstract: true },
      { module: 'src/c.ts', sourceFiles: ['src/c.ts'], functionCount: 1, worstCrap: 6.796875, bands: { low: 0, moderate: 1, high: 0, unknown: 0 }, dupePairs: 0, abstract: false },
    ]);
  });

  it('counts unattributed files from functions AND duplicate endpoints', () => {
    expect(report.unattributed).toEqual({ files: ['tests/a.test.ts', 'tests/b.test.ts'], functionCount: 1 });
  });
});

describe('buildReport normalizes absolute sibling paths', () => {
  // crap4ts and dry4ts emit absolute paths; arch4ts module names are relative.
  const absCrap = [
    { file: '/proj/src/a.ts', name: 'a', cc: 2, coverage: 1, crap: 2, risk: 'low', startLine: 1, endLine: 4 },
    { file: '/proj/src/b.ts', name: 'dupA', cc: 1, coverage: null, crap: null, risk: 'unknown', startLine: 2, endLine: 6 },
    { file: '/proj/tests/a.test.ts', name: 't', cc: 1, coverage: 1, crap: 1, risk: 'low', startLine: 1, endLine: 3 },
  ];
  const absDry = [
    { score: 1, left: { file: '/proj/src/b.ts', name: 'dupA', startLine: 2, endLine: 6, nodes: 40 }, right: { file: '/proj/src/a.ts', name: 'dup2', startLine: 12, endLine: 16, nodes: 40 } },
  ];
  const abs = buildReport({
    target: '/proj',
    thresholds: { maxCrap: 30, dryThreshold: 0.82 },
    architectureRaw: canned('canned-arch.json'),
    crapRaw: absCrap,
    dryRaw: absDry,
    generatedAt: '2026-09-14T00:00:00.000Z',
  });

  it('attributes functions to modules via relativized paths', () => {
    expect(abs.unattributed.files).toEqual(['tests/a.test.ts']);
    const a = abs.modules.find((m) => m.module === 'src/a.ts')!;
    expect(a.functionCount).toBe(1);
    expect(a.dupePairs).toBe(1);
  });

  it('aligns duplicates via relativized paths', () => {
    const dupA = abs.functions.find((f) => f.file === 'src/b.ts')!;
    expect(dupA.dupes).toEqual([{ otherFile: 'src/a.ts', otherName: 'dup2', otherStartLine: 12, score: 1 }]);
    expect(abs.duplicates[0].left.file).toBe('src/b.ts');
    expect(abs.duplicates[0].right.file).toBe('src/a.ts');
  });

  it('keeps files outside the target as-is', () => {
    const outside = buildReport({
      target: '/proj',
      thresholds: { maxCrap: 30, dryThreshold: 0.82 },
      architectureRaw: canned('canned-arch.json'),
      crapRaw: [{ file: '/elsewhere/src/z.ts', name: 'z', cc: 1, coverage: null, crap: null, risk: 'unknown', startLine: 1, endLine: 2 }],
      dryRaw: [],
      generatedAt: '2026-09-14T00:00:00.000Z',
    });
    expect(outside.functions[0].file).toBe('/elsewhere/src/z.ts');
  });
});
