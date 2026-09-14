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
});
