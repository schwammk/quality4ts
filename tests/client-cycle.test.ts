import { describe, expect, it } from 'vitest';
import { buildMapView } from '../client/src/projection.js';
import type { ReportDataset } from '../client/src/types.js';

// File graph acyclic, directory graph cyclic (a→b→c→a), mirroring quality4ts's
// own self-dogfood cycle shape:
//   src/a/main.ts → src/b/x.ts → src/c/y.ts → src/a/helper.ts
const ds: ReportDataset = {
  meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
  architecture: {
    architecture: {
      graph: {
        nodes: ['src/a/main.ts', 'src/a/helper.ts', 'src/b/x.ts', 'src/c/y.ts', 'src/z/orphan.ts'],
        edges: [
          { from: 'src/a/main.ts', to: 'src/b/x.ts', lines: [1] },
          { from: 'src/b/x.ts', to: 'src/c/y.ts', lines: [2] },
          { from: 'src/c/y.ts', to: 'src/a/helper.ts', lines: [3] },
          { from: 'src/a/main.ts', to: 'src/z/orphan.ts', lines: [9] },
        ],
      },
      abstractModules: [],
      moduleToSourceFile: Object.fromEntries(
        ['src/a/main.ts', 'src/a/helper.ts', 'src/b/x.ts', 'src/c/y.ts', 'src/z/orphan.ts'].map((f) => [f, f])
      ),
    },
    layering: { layers: [] },
  },
  functions: [],
  duplicates: [],
  modules: [],
  unattributed: { files: [], functionCount: 0 },
};

describe('buildMapView cycle + indicator data', () => {
  const view = buildMapView(ds, ['src']);

  it('exposes this level cycle paths (raw node ids)', () => {
    expect(view.cyclePaths.length).toBe(1);
    const participants = new Set(view.cyclePaths[0]);
    expect(participants.has('a')).toBe(true);
    expect(participants.has('b')).toBe(true);
    expect(participants.has('c')).toBe(true);
  });

  it('cycleLines keeps the joined display form for the cycle', () => {
    expect(view.cycleLines).toContain('a->b->c->a');
  });

  it('carries aggregated import lines on edges', () => {
    const toOrphan = view.edges.find((e) => e.to === 'z')!;
    expect(toOrphan.lines).toEqual([9]);
    const inner = view.edges.find((e) => e.from === 'a' && e.to === 'b')!;
    expect(inner.lines).toEqual([1]);
  });

  it('builds incoming/outgoing indicators per node (sorted by moduleId, direction)', () => {
    const ids = view.indicators.map((i) => `${i.moduleId}:${i.direction}`);
    expect(ids).toEqual([
      'a:incoming', 'a:outgoing',
      'b:incoming', 'b:outgoing',
      'c:incoming', 'c:outgoing',
      'z:incoming',
    ]);
  });

  it('anchors incoming triangles on the rect top edge, outgoing on the bottom', () => {
    const a = view.nodes.find((n) => n.id === 'a')!;
    const inc = view.indicators.find((i) => i.moduleId === 'a' && i.direction === 'incoming')!;
    const out = view.indicators.find((i) => i.moduleId === 'a' && i.direction === 'outgoing')!;
    expect(inc.triangle.y1).toBe(a.y);
    expect(inc.triangle.y2).toBe(a.y);
    expect(inc.triangle.y3).toBeGreaterThan(a.y);
    expect(out.triangle.y1).toBe(a.y + a.height);
    expect(out.triangle.y2).toBe(a.y + a.height);
    expect(out.triangle.y3).toBeGreaterThan(a.y + a.height);
    const cx = a.x + a.width / 2;
    expect(inc.triangle.x3).toBe(cx);
  });

  it('tooltip lines list dependency names with cycle flag ORed per name', () => {
    const aOut = view.indicators.find((i) => i.moduleId === 'a' && i.direction === 'outgoing')!;
    expect(aOut.tooltipLines).toEqual([
      { text: 'b', cycle: false },
      { text: 'z', cycle: false },
    ]);
    const cOut = view.indicators.find((i) => i.moduleId === 'c' && i.direction === 'outgoing')!;
    expect(cOut.tooltipLines).toEqual([{ text: 'a', cycle: true }]);
    expect(cOut.cycle).toBe(true);
  });
});
