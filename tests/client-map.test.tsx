// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MapView } from '../client/src/map.js';
import type { ReportDataset } from '../client/src/types.js';

const ds: ReportDataset = {
  meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
  architecture: {
    architecture: {
      graph: {
        nodes: ['src/main.ts', 'src/util/helper.ts', 'src/types/i.ts'],
        edges: [{ from: 'src/main.ts', to: 'src/util/helper.ts' }, { from: 'src/main.ts', to: 'src/types/i.ts' }, { from: 'src/util/helper.ts', to: 'src/types/i.ts' }],
      },
      abstractModules: ['src/types/i.ts'],
      moduleToSourceFile: { 'src/main.ts': 'src/main.ts', 'src/util/helper.ts': 'src/util/helper.ts', 'src/types/i.ts': 'src/types/i.ts' },
    },
    layering: { layers: [] },
  },
  functions: [],
  duplicates: [],
  modules: [
    { module: 'src/main.ts', sourceFiles: ['src/main.ts'], functionCount: 0, worstCrap: 65, bands: { low: 0, moderate: 0, high: 1, unknown: 0 }, dupePairs: 1, abstract: false },
    { module: 'src/util/helper.ts', sourceFiles: ['src/util/helper.ts'], functionCount: 0, worstCrap: null, bands: { low: 0, moderate: 0, high: 0, unknown: 0 }, dupePairs: 0, abstract: false },
    { module: 'src/types/i.ts', sourceFiles: ['src/types/i.ts'], functionCount: 0, worstCrap: null, bands: { low: 0, moderate: 0, high: 0, unknown: 0 }, dupePairs: 0, abstract: true },
  ],
  unattributed: { files: [], functionCount: 0 },
};

// The map drills into ['src'] first (at root, all modules share the top segment 'src',
// so the root view is one directory node). Node ids at ['src'] are the extension-stripped
// child names: 'main', 'util', 'types'.

describe('MapView', () => {
  let container: HTMLElement;
  let root: Root;
  const mount = (onOpenModule: (m: string) => void = () => {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<MapView dataset={ds} initialPath={['src']} onOpenModule={onOpenModule} />); });
  };
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('renders one rect per projected node with leaf strokes and badges', () => {
    mount();
    const rects = container.querySelectorAll('svg rect[data-module]');
    expect(rects.length).toBe(3);
    expect(container.querySelectorAll('svg line[data-from]').length).toBe(3);
    // badge lookup goes through NodeView.module ('src/main.ts') → worstCrap 65
    const badge = container.querySelector('g.badge text')?.textContent;
    expect(badge).toBe('65');
  });

  it('hovering a module dims unconnected edges and their arrowheads', () => {
    mount();
    const svg = container.querySelector('svg')!;
    // 'util' has one incident edge (util→types); main→util and main→types dim
    const target = svg.querySelector('rect[data-module="util"]')!;
    act(() => {
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const dimmed = svg.querySelectorAll('.dimmed');
    expect(dimmed.length).toBeGreaterThan(0);
    dimmed.forEach((el) => {
      const from = el.getAttribute('data-from')!;
      const to = el.getAttribute('data-to')!;
      expect(from === 'util' || to === 'util').toBe(false);
    });
    act(() => {
      svg.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(svg.querySelectorAll('.dimmed').length).toBe(0);
  });

  it('clicking a leaf module reports the module KEY via onOpenModule', () => {
    const seen: string[] = [];
    mount((m) => seen.push(m));
    const leaf = container.querySelector('svg rect[data-module="main"]') as SVGElement;
    act(() => { leaf.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(seen).toEqual(['src/main.ts']);
  });

  it('renders indicator triangles and shows the dependency list on hover', () => {
    mount();
    const polygons = container.querySelectorAll('svg polygon[data-indicator]');
    // main: 1 outgoing; util: 1 in + 1 out; types: 1 incoming
    expect(polygons.length).toBe(4);
    const utilIn = container.querySelector('svg polygon[data-indicator="util"][data-direction="incoming"]')!;
    act(() => { utilIn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    const tip = container.querySelector('#map-tip');
    expect(tip?.textContent).toContain('main');
    act(() => { utilIn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(container.querySelector('#map-tip')).toBeNull();
  });

  it('fills abstract arrowheads in ink, reserving red for cycle feedback', () => {
    mount();
    const heads = [...container.querySelectorAll('svg polygon[data-from]:not([data-indicator])')];
    const abstractHeads = heads.filter((p) => p.getAttribute('fill') !== 'none');
    expect(abstractHeads.length).toBeGreaterThan(0);
    for (const p of abstractHeads) expect(p.getAttribute('fill')).toBe('#1f2430');
    expect(heads.some((p) => p.getAttribute('fill') === '#c92a2a')).toBe(false);
  });
});

// --- cycle dataset: file graph acyclic, directory graph cyclic a→b→c→a ---

const cycleDs: ReportDataset = {
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

const leafDs: ReportDataset = {
  meta: { generatedAt: '', target: '', thresholds: { maxCrap: 30, dryThreshold: 0.82 }, tools: { arch4ts: null, crap4ts: null, dry4ts: null } },
  architecture: {
    architecture: {
      graph: {
        nodes: ['src/main.ts', 'src/helper.ts'],
        edges: [{ from: 'src/main.ts', to: 'src/helper.ts', lines: [4] }],
      },
      abstractModules: [],
      moduleToSourceFile: { 'src/main.ts': 'src/main.ts', 'src/helper.ts': 'src/helper.ts' },
    },
    layering: { layers: [] },
  },
  functions: [],
  duplicates: [],
  modules: [],
  unattributed: { files: [], functionCount: 0 },
};

describe('MapView cycle focus and trace', () => {
  let container: HTMLElement;
  let root: Root;
  const mountCycle = (onOpenSource?: (file: string, line: number) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MapView dataset={cycleDs} initialPath={['src']} onOpenModule={() => {}} onOpenSource={onOpenSource} />
      );
    });
  };
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('hovering a cycle line dims off-cycle edges; click locks the focus', () => {
    mountCycle();
    const svg = container.querySelector('svg')!;
    const line = svg.querySelector('text[data-cycle-line]')!;
    expect(line.textContent).toMatch(/^(a|b|c)->/);
    act(() => { line.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    const offCycleDimmed = () =>
      [...svg.querySelectorAll('line.dimmed[data-from], polygon.dimmed[data-from]')]
        .filter((el) => el.getAttribute('data-from') === 'a' && el.getAttribute('data-to') === 'z');
    expect(offCycleDimmed().length).toBe(2); // the a→z line + arrowhead
    act(() => { svg.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(svg.querySelectorAll('.dimmed').length).toBe(0);
    act(() => { line.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { svg.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(offCycleDimmed().length).toBe(2); // locked
    act(() => { line.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // toggle off
    expect(svg.querySelectorAll('.dimmed').length).toBe(0);
  });

  it('marks focused cycle participant boxes red', () => {
    mountCycle();
    const svg = container.querySelector('svg')!;
    const line = svg.querySelector('text[data-cycle-line]')!;
    act(() => { line.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rectA = svg.querySelector('rect[data-module="a"]') as SVGRectElement;
    expect(rectA.getAttribute('stroke')).toBe('#b40000');
    const rectZ = svg.querySelector('rect[data-module="z"]') as SVGRectElement;
    expect(rectZ.getAttribute('stroke')).not.toBe('#b40000');
  });

  it('hovering a traced leaf edge shows the import line; click opens the source panel', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const seen: { file: string; line: number }[] = [];
    act(() => {
      root.render(
        <MapView dataset={leafDs} initialPath={['src']} onOpenModule={() => {}} onOpenSource={(file, line) => seen.push({ file, line })} />
      );
    });
    const svg = container.querySelector('svg')!;
    const line1 = svg.querySelector('line[data-from]')!;
    act(() => { line1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(container.querySelector('#map-tip')?.textContent).toContain('import');
    act(() => { line1.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(seen).toEqual([{ file: 'src/main.ts', line: 4 }]);
  });
});
