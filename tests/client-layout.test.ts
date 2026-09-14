import { describe, expect, it } from 'vitest';
import { assignLevels, breakCycles, orderRowByBarycenter } from '../client/src/layout.js';
import { projectModules } from '../client/src/projection.js';
import type { ReportDataset } from '../client/src/types.js';

const dataset = (nodes: string[], edges: [string, string][]): ReportDataset => ({
  meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
  architecture: {
    architecture: { graph: { nodes, edges: edges.map(([from, to]) => ({ from, to })) }, abstractModules: [], moduleToSourceFile: Object.fromEntries(nodes.map((n) => [n, n])) },
    layering: { layers: [] },
  },
  functions: [], duplicates: [], modules: [], unattributed: { files: [], functionCount: 0 },
});

describe('assignLevels (Kahn longest-path, iterative)', () => {
  it('chain gets levels 1,2,3', () => {
    expect(assignLevels(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]))
      .toEqual(new Map([['a', 1], ['b', 2], ['c', 3]]));
  });

  it('a 3-cycle breaks to levels 1,2,3 with one feedback edge', () => {
    const result = breakCycles(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]);
    expect(result.feedback).toEqual([{ from: 'c', to: 'a' }]);
    expect(result.acyclic.length).toBe(2);
    expect(assignLevels(['a', 'b', 'c'], result.acyclic)).toEqual(new Map([['a', 1], ['b', 2], ['c', 3]]));
  });
});

describe('orderRowByBarycenter', () => {
  it('reorders a row to reduce crossings', () => {
    // row0 [a,b] with edges a→y, b→x; row1 alphabetical [x,y,z] → [y,x,z]
    expect(orderRowByBarycenter([['a', 'b'], ['x', 'y', 'z']], [{ from: 'a', to: 'y' }, { from: 'b', to: 'x' }], 4))
      .toEqual([['a', 'b'], ['y', 'x', 'z']]);
  });
});

describe('projectModules', () => {
  const ds = dataset(['src/main.ts', 'src/util/helper.ts', 'src/types/i.ts', 'src/app/core.ts'], [
    ['src/main.ts', 'src/util/helper.ts'], ['src/main.ts', 'src/types/i.ts'],
    ['src/util/helper.ts', 'src/types/i.ts'], ['src/app/core.ts', 'src/types/i.ts'],
  ]);

  it('root projects to the single top-level segment (all modules share src/)', () => {
    const view = projectModules(ds.architecture.architecture.graph, []);
    expect(view.children).toEqual(['src']);
  });

  it('scoped path keeps children under the prefix, extensions stripped', () => {
    expect(projectModules(ds.architecture.architecture.graph, ['src']).children.sort())
      .toEqual(['app', 'main', 'types', 'util']);
    expect(projectModules(ds.architecture.architecture.graph, ['src', 'app']).children)
      .toEqual(['core']);
  });
});
