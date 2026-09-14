// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { filterByRisk, Hotspots, sortFunctions } from '../client/src/hotspots.js';
import type { FunctionFinding } from '../client/src/types.js';

const fn = (over: Partial<FunctionFinding>): FunctionFinding => ({
  file: 'src/a.ts', name: 'a', startLine: 1, endLine: 2, cc: 1, coverage: 1, crap: 2, risk: 'low', dupes: [], ...over,
});
const FUNCS = [
  fn({ name: 'hot', crap: 65, risk: 'high', cc: 8 }),
  fn({ name: 'mid', crap: 12, risk: 'moderate', cc: 4 }),
  fn({ name: 'cold', crap: 2, risk: 'low', cc: 2 }),
  fn({ file: 'tests/x.test.ts', name: 't', crap: null, risk: 'unknown', cc: 1, coverage: null }),
];

describe('pure helpers', () => {
  it('sorts by crap desc with nulls last, name asc tiebreak', () => {
    expect(sortFunctions(FUNCS, 'crap', -1).map((f) => f.name)).toEqual(['hot', 'mid', 'cold', 't']);
  });
  it('sorts by name asc', () => {
    expect(sortFunctions(FUNCS, 'name', 1).map((f) => f.name)).toEqual(['cold', 'hot', 'mid', 't']);
  });
  it('filters by risk', () => {
    expect(filterByRisk(FUNCS, 'high')).toHaveLength(1);
    expect(filterByRisk(FUNCS, 'all')).toHaveLength(4);
  });
});

describe('Hotspots component', () => {
  let container: HTMLElement;
  let root: Root;
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const ds = () => ({
    meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
    architecture: { architecture: { graph: { nodes: [], edges: [] }, abstractModules: [], moduleToSourceFile: {} }, layering: { layers: [] } },
    functions: FUNCS, duplicates: [], modules: [], unattributed: { files: [], functionCount: 0 },
  }) as ReportDataset;

  it('renders rows sorted by crap desc and marks the risk band', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<Hotspots dataset={ds()} moduleFilter={null} onOpenFunction={() => {}} />); });
    const cells = [...container.querySelectorAll('tbody tr td:nth-child(2)')].map((td) => td.textContent);
    expect(cells).toEqual(['hot', 'mid', 'cold', 't']);
    expect(container.querySelector('tbody tr .badge')?.getAttribute('style')).toContain('#c92a2a');
  });
});
