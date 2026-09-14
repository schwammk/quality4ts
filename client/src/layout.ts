// Port of arch4ts src/layout/layers.ts + src/render/scene.ts (per-module geometry),
// adapted to plain node/edge inputs. All pure and deterministic; ties broken by id.

export interface Edge {
  from: string;
  to: string;
}

export const LAYOUT = {
  canvasWidth: 1200,
  layerHeight: 140,
  sceneTopPadding: 42,
  rectScale: 0.5,
  trackCount: 5,
  trackMargin: 24,
  trackGap: 24,
  rowSpacingFactor: 1.5,
  peerSpacingFactor: 1.5,
  labelCharWidth: 7,
  lineHeight: 14,
  triangleSide: 12,
  triangleHeightFactor: 0.8660254037844386,
  hoverTolerance: 5,
  cycleTitleOffset: 28,
  cycleLineHeight: 16,
  nubWidth: 10,
} as const;

export interface NodeView {
  id: string;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  abstract: boolean;
  leaf: boolean;
  label: string;
  fullName: string;
  module: string | null;
}

export interface EdgeView {
  from: string;
  to: string;
  count: number;
  type: 'abstract' | 'direct';
  cycleBreak: boolean;
}

export interface MapView {
  namespacePath: string[];
  nodes: NodeView[];
  edges: EdgeView[];
  cycleLines: string[];
  sceneHeight: number;
}

const EXACT_MAX_NODES = 8;
const EXACT_MAX_EDGES = 12;

function edgeLess(a: Edge, b: Edge): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  return a.to < b.to ? -1 : 1;
}

export function normalizeEdges(nodes: string[], edges: Edge[]): Edge[] {
  const nodeSet = new Set(nodes);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of [...edges].sort(edgeLess)) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
    const key = `${e.from}\u0000${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// Iterative Tarjan SCC (no recursion, stack-safe on large graphs).
export function tarjanSCC(nodes: string[], adjacency: Map<string, Edge[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of nodes) {
    if (index.has(root)) continue;
    // frames: [node, edgeCursor]
    const frames: [string, number][] = [[root, 0]];
    index.set(root, counter);
    low.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const [node, cursor] = frame;
      const neighbors = adjacency.get(node) ?? [];
      if (cursor < neighbors.length) {
        frame[1] += 1;
        const next = neighbors[cursor].to;
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          frames.push([next, 0]);
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!));
        }
      } else {
        frames.pop();
        if (frames.length > 0) {
          const parent = frames[frames.length - 1][0];
          low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
        }
        if (low.get(node) === index.get(node)) {
          const component: string[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            component.push(w);
            if (w === node) break;
          }
          component.sort();
          components.push(component);
        }
      }
    }
  }
  return components.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function isDag(nodes: string[], edges: Edge[]): boolean {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n, 0);
  const outMap = new Map<string, string[]>();
  for (const n of nodes) outMap.set(n, []);
  for (const e of edges) {
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    outMap.get(e.from)!.push(e.to);
  }
  let remaining = nodes.length;
  const queue = nodes.filter((n) => (indegree.get(n) ?? 0) === 0);
  while (queue.length > 0) {
    const n = queue.shift()!;
    remaining -= 1;
    for (const dep of outMap.get(n) ?? []) {
      const d = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }
  return remaining === 0;
}

function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const current: T[] = [];
  const rec = (start: number): void => {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      rec(i + 1);
      current.pop();
    }
  };
  rec(0);
  return result;
}

function edgeCmp(a: Edge, b: Edge): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  return 0;
}

function removalLess(a: Edge[], b: Edge[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = edgeCmp(a[i], b[i]);
    if (c !== 0) return c < 0;
  }
  return a.length < b.length;
}

function exactFeedback(nodes: string[], edges: Edge[]): Edge[] {
  const sorted = [...edges].sort(edgeLess);
  for (let k = 0; k <= sorted.length; k++) {
    let best: Edge[] | null = null;
    for (const removal of combinations(sorted, k)) {
      const removeSet = new Set(removal.map((e) => `${e.from}\u0000${e.to}`));
      const rest = sorted.filter((e) => !removeSet.has(`${e.from}\u0000${e.to}`));
      if (!isDag(nodes, rest)) continue;
      if (best === null || removalLess(best, removal)) best = removal;
    }
    if (best !== null) return [...best].sort(edgeLess);
  }
  return greedyFeedback(nodes, edges); // unreachable in practice; safety net
}

function greedyFeedback(nodes: string[], edges: Edge[]): Edge[] {
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    outDegree.set(n, 0);
    inDegree.set(n, 0);
  }
  for (const e of edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }
  const outMap = new Map<string, string[]>();
  const inMap = new Map<string, string[]>();
  for (const n of nodes) {
    outMap.set(n, []);
    inMap.set(n, []);
  }
  for (const e of edges) {
    outMap.get(e.from)!.push(e.to);
    inMap.get(e.to)!.push(e.from);
  }
  const remaining = new Set(nodes);
  const left: string[] = [];
  const right: string[] = [];

  const sortedRemaining = (): string[] => [...remaining].sort();

  const removeNode = (n: string): void => {
    remaining.delete(n);
    for (const t of outMap.get(n) ?? []) {
      if (remaining.has(t)) inDegree.set(t, (inDegree.get(t) ?? 0) - 1);
    }
    for (const s of inMap.get(n) ?? []) {
      if (remaining.has(s)) outDegree.set(s, (outDegree.get(s) ?? 0) - 1);
    }
  };

  while (remaining.size > 0) {
    const sources = sortedRemaining().filter((n) => (inDegree.get(n) ?? 0) === 0);
    if (sources.length > 0) {
      left.push(sources[0]);
      removeNode(sources[0]);
      continue;
    }
    const sinks = sortedRemaining().filter((n) => (outDegree.get(n) ?? 0) === 0);
    if (sinks.length > 0) {
      right.push(sinks[0]);
      removeNode(sinks[0]);
      continue;
    }
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const n of sortedRemaining()) {
      const score = (outDegree.get(n) ?? 0) - (inDegree.get(n) ?? 0);
      // ties resolved by lexicographically-largest name → keep scanning with >=
      if (score >= bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best === null) break;
    left.push(best);
    removeNode(best);
  }

  const order = [...left, ...[...right].reverse()];
  const idx = new Map<string, number>();
  order.forEach((n, i) => idx.set(n, i));
  return edges
    .filter((e) => (idx.get(e.from) ?? -1) >= (idx.get(e.to) ?? -1))
    .sort(edgeLess);
}

// Per cyclic component: exact minimal feedback edge set by increasing-size subset
// search for small components, else Eades greedy.
export function breakCycles(nodes: string[], edges: Edge[]): { feedback: Edge[]; acyclic: Edge[] } {
  const normalized = normalizeEdges(nodes, edges);
  const adjacency = new Map<string, Edge[]>();
  for (const n of nodes) adjacency.set(n, []);
  for (const e of normalized) adjacency.get(e.from)!.push(e);
  for (const list of adjacency.values()) list.sort(edgeLess);

  const components = tarjanSCC([...nodes].sort(), adjacency);
  const feedback: Edge[] = [];
  for (const component of components) {
    const compSet = new Set(component);
    const internal = normalized.filter((e) => compSet.has(e.from) && compSet.has(e.to));
    const hasSelfLoop = internal.some((e) => e.from === e.to);
    const cyclic = component.length > 1 || hasSelfLoop;
    if (!cyclic) continue;
    if (component.length <= EXACT_MAX_NODES && internal.length <= EXACT_MAX_EDGES) {
      feedback.push(...exactFeedback(component, internal));
    } else {
      feedback.push(...greedyFeedback(component, internal));
    }
  }
  feedback.sort(edgeLess);
  const feedbackSet = new Set(feedback.map((e) => `${e.from}\u0000${e.to}`));
  const acyclic = normalized.filter((e) => !feedbackSet.has(`${e.from}\u0000${e.to}`));
  return { feedback, acyclic };
}

// Kahn longest-path with a sorted queue; levels initialized to 1; then the re-max
// pass via processed incoming roots (arch4ts parity — makes a 3-cycle land on 1/2/3).
export function assignLevels(nodes: string[], acyclicEdges: Edge[]): Map<string, number> {
  const levels = new Map<string, number>();
  for (const n of nodes) levels.set(n, 1);
  const indegree = new Map<string, number>();
  const outMap = new Map<string, string[]>();
  const inMap = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n, 0);
    outMap.set(n, []);
    inMap.set(n, []);
  }
  for (const e of acyclicEdges) {
    if (!outMap.has(e.from) || !inMap.has(e.to)) continue;
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    outMap.get(e.from)!.push(e.to);
    inMap.get(e.to)!.push(e.from);
  }
  for (const m of outMap.values()) m.sort();
  const queue = nodes.filter((n) => (indegree.get(n) ?? 0) === 0).sort();

  const processed = new Set<string>();
  const workQueue = [...queue];
  while (workQueue.length > 0) {
    // Kahn with sorted queue: pop smallest
    workQueue.sort();
    const node = workQueue.shift()!;
    if (processed.has(node)) continue;
    processed.add(node);
    const nodeLevel = levels.get(node) ?? 1;
    for (const dep of outMap.get(node) ?? []) {
      levels.set(dep, Math.max(levels.get(dep) ?? 1, nodeLevel + 1));
      const d = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, d);
      if (d === 0) workQueue.push(dep);
    }
    // re-max via incoming roots (arch-view parity)
    const roots = (inMap.get(node) ?? []).filter((r) => processed.has(r));
    if (roots.length > 0) {
      const maxRoot = Math.max(...roots.map((r) => levels.get(r) ?? 1));
      levels.set(node, Math.max(levels.get(node) ?? 1, maxRoot + 1));
    }
  }
  return levels;
}

// Barycenter sweep ordering (light Sugiyama crossing reduction): alternating
// down/up sweeps; each row is ordered by the mean position of its neighbors in
// the reference row; no-neighbor nodes keep their current index; ties break by
// id. Row membership never changes.
export function orderRowByBarycenter(
  rows: string[][],
  edges: Edge[],
  sweeps = 4
): string[][] {
  const rowOf = new Map<string, number>();
  rows.forEach((ids, row) => {
    for (const id of ids) rowOf.set(id, row);
  });
  const nodeIds = new Set(rowOf.keys());
  const adjacency = new Map<string, Set<string>>();
  const addAdj = (a: string, b: string) => {
    const s = adjacency.get(a) ?? new Set<string>();
    s.add(b);
    adjacency.set(a, s);
  };
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
    addAdj(e.from, e.to);
    addAdj(e.to, e.from);
  }
  const rowsList = rows.map((_, row) => row);
  const order = new Map<number, string[]>(rows.map((ids, row) => [row, [...ids]]));
  const posOf = new Map<string, number>();
  const resetPos = () => {
    for (const ids of order.values()) ids.forEach((id, i) => posOf.set(id, i));
  };
  resetPos();
  const barycenterSweep = (refDir: -1 | 1): void => {
    const seq =
      refDir === -1
        ? rowsList.slice(1)
        : rowsList.slice(0, -1).reverse();
    for (const row of seq) {
      const refRow = row + refDir;
      const ids = order.get(row)!;
      const scored = ids.map((id, i) => {
        const nbrs = [...(adjacency.get(id) ?? [])].filter((n) => rowOf.get(n) === refRow);
        const bary =
          nbrs.length === 0
            ? i
            : nbrs.reduce((s, n) => s + (posOf.get(n) ?? 0), 0) / nbrs.length;
        return { id, bary };
      });
      scored.sort((a, b) => a.bary - b.bary || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      order.set(row, scored.map((s) => s.id));
      resetPos();
    }
  };
  for (let i = 0; i < sweeps; i++) {
    barycenterSweep(i % 2 === 0 ? -1 : 1);
  }
  return rowsList.map((row) => order.get(row)!);
}

function abbreviate(fullName: string): string {
  const parts = fullName.split('/');
  return parts[parts.length - 1] ?? fullName;
}

// Centered-peer-x: the peers of one row share the usable width; preferred
// spacing is rectWidth * peerSpacingFactor, clamped so the group fits, and the
// group is centered on the racetrack area (arch-view layout.clj parity).
function centeredPeerX(
  rectWidth: number,
  usable: number,
  peerIdx: number,
  peerCount: number
): number {
  const preferredSpacing = rectWidth * LAYOUT.peerSpacingFactor;
  const maxSpacing =
    peerCount > 1 ? Math.max(0, (usable - rectWidth) / (peerCount - 1)) : 0;
  const spacing = peerCount > 1 ? Math.min(preferredSpacing, maxSpacing) : 0;
  const groupWidth = rectWidth + (peerCount - 1) * spacing;
  const groupStart = LAYOUT.trackMargin + (usable - groupWidth) / 2;
  return groupStart + peerIdx * spacing;
}

export interface LayoutViewOptions {
  abstract?: (id: string) => boolean;
  leaf?: (id: string) => boolean;
  label?: (id: string) => string;
  fullName?: (id: string) => string;
  module?: (id: string) => string | null;
}

// One rect per node, laid out by level rank rows + barycenter order + centered
// peer-x geometry. Returns nodes sorted by (row, x).
export function layoutView(
  nodeIds: string[],
  edges: Edge[],
  opts: LayoutViewOptions = {}
): NodeView[] {
  const { acyclic } = breakCycles(nodeIds, edges);
  const levels = assignLevels(nodeIds, acyclic);
  const layerEdges = acyclic;
  const moduleToLayer = new Map<string, number>(
    nodeIds.map((n) => [n, (levels.get(n) ?? 1) - 1])
  );

  const trackWidth =
    (LAYOUT.canvasWidth - 2 * LAYOUT.trackMargin - (LAYOUT.trackCount - 1) * LAYOUT.trackGap) /
    LAYOUT.trackCount;
  const rectWidth = LAYOUT.rectScale * trackWidth;
  const rectHeight = LAYOUT.rectScale * LAYOUT.layerHeight;
  const usable = Math.max(rectWidth, LAYOUT.canvasWidth - 2 * LAYOUT.trackMargin);

  const layerGroups = new Map<number, string[]>();
  for (const n of nodeIds) {
    const layer = moduleToLayer.get(n)!;
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(n);
  }
  const distinctIndexes = [...layerGroups.keys()].sort((a, b) => a - b);
  const indexToRow = new Map<number, number>(distinctIndexes.map((idx, r) => [idx, r]));

  const rowMembers = new Map<number, string[]>();
  for (const idx of distinctIndexes) {
    const list = (layerGroups.get(idx) ?? []).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    rowMembers.set(indexToRow.get(idx)!, list);
  }
  const ordered = orderRowByBarycenter(
    distinctIndexes.map((idx) => rowMembers.get(indexToRow.get(idx)!)!),
    layerEdges
  );

  const abstractOf = opts.abstract ?? (() => false);
  const leafOf = opts.leaf ?? (() => false);
  const labelOf = opts.label ?? abbreviate;
  const fullNameOf = opts.fullName ?? ((id: string) => id);
  const moduleOf = opts.module ?? (() => null);

  const nodes: NodeView[] = [];
  ordered.forEach((ids, row) => {
    const y = LAYOUT.sceneTopPadding + row * rectHeight * LAYOUT.rowSpacingFactor;
    ids.forEach((id, peerIdx) => {
      nodes.push({
        id,
        row,
        x: centeredPeerX(rectWidth, usable, peerIdx, ids.length),
        y,
        width: rectWidth,
        height: rectHeight,
        abstract: abstractOf(id),
        leaf: leafOf(id),
        label: labelOf(id),
        fullName: fullNameOf(id),
        module: moduleOf(id),
      });
    });
  });

  return nodes.sort((a, b) => a.row - b.row || a.x - b.x);
}
