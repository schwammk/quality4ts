import { describe, expect, it } from 'vitest';
import { alignDuplicates, parseCrap4ts, parseDry4ts } from '../src/merge/ingest.js';
import { CliError } from '../src/cli-error.js';
import type { FunctionFinding } from '../src/types.js';

const fn = (over: Partial<FunctionFinding>): FunctionFinding => ({
  file: 'src/a.ts', name: 'f', startLine: 1, endLine: 2,
  cc: 1, coverage: 1, crap: 1, risk: 'low', dupes: [], ...over,
});

describe('parseCrap4ts', () => {
  it('parses a valid array with dupes empty', () => {
    const out = parseCrap4ts([
      { file: 'src/a.ts', name: 'f', cc: 2, coverage: 1, crap: 2, risk: 'low', startLine: 1, endLine: 3 },
    ]);
    expect(out).toEqual([fn({ file: 'src/a.ts', name: 'f', cc: 2, coverage: 1, crap: 2, risk: 'low', startLine: 1, endLine: 3 })]);
  });

  it('accepts null coverage/crap (uncovered functions)', () => {
    const out = parseCrap4ts([{ file: 'x.ts', name: 'g', cc: 1, coverage: null, crap: null, risk: 'unknown', startLine: 5, endLine: 9 }]);
    expect(out[0].crap).toBeNull();
    expect(out[0].risk).toBe('unknown');
  });

  it('throws CliError on a malformed entry', () => {
    expect(() => parseCrap4ts([{ file: 42 }])).toThrow(CliError);
  });

  it('throws CliError on non-array input', () => {
    expect(() => parseCrap4ts({ nope: true })).toThrow(CliError);
  });
});

describe('parseDry4ts', () => {
  it('parses pairs and drops the nodes fingerprints', () => {
    const out = parseDry4ts([{
      score: 1, left: { file: 'a.ts', name: 'x', startLine: 1, endLine: 4, nodes: 42 },
      right: { file: 'b.ts', name: 'y', startLine: 9, endLine: 12, nodes: 42 },
    }]);
    expect(out).toEqual([{ score: 1, left: { file: 'a.ts', name: 'x', startLine: 1, endLine: 4 }, right: { file: 'b.ts', name: 'y', startLine: 9, endLine: 12 } }]);
  });

  it('throws CliError on a malformed pair', () => {
    expect(() => parseDry4ts([{ score: 'high', left: {}, right: {} }])).toThrow(CliError);
  });
});

describe('alignDuplicates', () => {
  it('attaches by file + startLine in both directions', () => {
    const fns = [fn({}), fn({ file: 'src/b.ts', name: 'g', startLine: 9 })];
    const pairs = [{
      score: 0.9,
      left: { file: 'src/a.ts', name: 'f', startLine: 1, endLine: 2 },
      right: { file: 'src/b.ts', name: 'g', startLine: 9, endLine: 12 },
    }];
    const out = alignDuplicates(fns, pairs);
    expect(out[0].dupes).toEqual([{ otherFile: 'src/b.ts', otherName: 'g', otherStartLine: 9, score: 0.9 }]);
    expect(out[1].dupes).toEqual([{ otherFile: 'src/a.ts', otherName: 'f', otherStartLine: 1, score: 0.9 }]);
  });

  it('falls back to file + name when startLine does not match', () => {
    const fns = [fn({ startLine: 100 })];
    const pairs = [{
      score: 1,
      left: { file: 'src/a.ts', name: 'f', startLine: 1, endLine: 2 },
      right: { file: 'src/z.ts', name: 'zzz', startLine: 3, endLine: 4 },
    }];
    const out = alignDuplicates(fns, pairs);
    expect(out[0].dupes).toEqual([{ otherFile: 'src/z.ts', otherName: 'zzz', otherStartLine: 3, score: 1 }]);
  });

  it('never mutates the input functions', () => {
    const fns = [fn({})];
    alignDuplicates(fns, []);
    expect(fns[0].dupes).toEqual([]);
  });
});
