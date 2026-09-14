// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Duplicates } from '../client/src/dupes.js';
import type { DuplicatePair, ReportDataset } from '../client/src/types.js';

const pair = (score: number, lf: string, ll: number, rf: string, rl: number): DuplicatePair => ({
  score,
  left: { file: lf, name: 'dupA', startLine: ll, endLine: ll + 4 },
  right: { file: rf, name: 'dupB', startLine: rl, endLine: rl + 4 },
});
const PAIRS = [pair(0.9, 'src/b.ts', 2, 'src/a.ts', 12), pair(1.0, 'src/c.ts', 4, 'src/d.ts', 8)];

describe('Duplicates component', () => {
  it('renders pairs sorted by score desc and reports clicks', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const seen: string[] = [];
    const ds = {
      meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
      architecture: { architecture: { graph: { nodes: [], edges: [] }, abstractModules: [], moduleToSourceFile: {} }, layering: { layers: [] } },
      functions: [], duplicates: PAIRS, modules: [], unattributed: { files: [], functionCount: 0 },
    } as ReportDataset;
    act(() => { root.render(<Duplicates dataset={ds} onOpenPair={(lf, ll) => seen.push(`${lf}:${ll}`)} />); });
    const firstRow = container.querySelector('tbody tr')!;
    expect(firstRow.textContent).toContain('1');
    act(() => { (firstRow.querySelector('button') as HTMLElement).click(); });
    expect(seen).toEqual(['src/c.ts:4']);
    act(() => root.unmount());
    container.remove();
  });
});
