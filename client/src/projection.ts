// Port of arch4ts src/projection/view.ts (viewArchitecture) adapted to the
// ReportDataset architecture dump. Pure and deterministic; synchronous so the
// map view can re-run on every drill.
import {
  LAYOUT,
  breakCycles,
  layoutView,
  type Edge,
  type EdgeView,
  type MapView,
  type NodeView,
} from './layout.js';
import type { ReportDataset } from './types.js';

const MIXED_LEAF_SUFFIX = '|file';

const stripFileSuffix = (id: string): string =>
  id.endsWith(MIXED_LEAF_SUFFIX) ? id.slice(0, -MIXED_LEAF_SUFFIX.length) : id;

interface Graph {
  nodes: string[];
  edges: { from: string; to: string }[];
}

interface ChildInfo {
  exactModule: string | null; // module at exactly depth+1 (a file directly in this dir)
  descendants: string[]; // modules strictly deeper
}

interface ProjectionInternal {
  nodeIds: string[];
  childInfo: Map<string, ChildInfo>;
  moduleToNode: Map<string, string>;
}

function projectChildInfo(graph: Graph, path: string[]): ProjectionInternal {
  const prefix = path.join('/');
  const scoped = graph.nodes.filter((m) => {
    if (!m.startsWith(prefix ? prefix + '/' : '')) return false;
    const rest = m.slice(prefix ? prefix.length + 1 : 0);
    return rest.length > 0;
  });

  const childInfo = new Map<string, ChildInfo>();
  const moduleToNode = new Map<string, string>();
  for (const m of scoped) {
    const rest = m.slice(prefix ? prefix.length + 1 : 0);
    const slashIdx = rest.indexOf('/');
    const child = (slashIdx === -1 ? rest : rest.slice(0, slashIdx)).replace(/\.(ts|tsx)$/, '');
    if (!childInfo.has(child)) childInfo.set(child, { exactModule: null, descendants: [] });
    const info = childInfo.get(child)!;
    if (slashIdx === -1) {
      info.exactModule = m;
    } else {
      info.descendants.push(m);
    }
  }

  // node ids: plain child, or child|file for mixed-leaf
  const nodeIds: string[] = [];
  for (const [child, info] of childInfo) {
    if (info.exactModule !== null && info.descendants.length > 0) {
      nodeIds.push(child + MIXED_LEAF_SUFFIX);
      moduleToNode.set(info.exactModule, child + MIXED_LEAF_SUFFIX);
      for (const d of info.descendants) moduleToNode.set(d, child + MIXED_LEAF_SUFFIX);
    } else {
      nodeIds.push(child);
      if (info.exactModule !== null) moduleToNode.set(info.exactModule, child);
      for (const d of info.descendants) moduleToNode.set(d, child);
    }
  }
  nodeIds.sort();

  return { nodeIds, childInfo, moduleToNode };
}

// Project the module graph to `path`: scope filter strictly deeper
// (rest.length > 0), extension-stripped child names, mixed-leaf `child|file`
// merge, per-child {exactModule, descendants} bucketing.
export function projectModules(graph: Graph, path: string[]): {
  children: string[];
  memberOf: Map<string, string[]>;
} {
  const { nodeIds, childInfo, moduleToNode } = projectChildInfo(graph, path);
  const memberOf = new Map<string, string[]>();
  for (const m of graph.nodes) {
    const nodeId = moduleToNode.get(m);
    if (nodeId !== undefined) memberOf.set(m, [nodeId]);
  }
  void childInfo;
  return { children: nodeIds, memberOf };
}

interface NodeInfo {
  id: string;
  leaf: boolean;
  label: string;
  fullName: string;
  module: string | null; // underlying module key for leaf/mixed-leaf, null for directories
  contained: string[];
  hasDeeper: boolean;
}

interface AggregatedEdge {
  from: string;
  to: string;
  type: 'abstract' | 'direct';
  count: number;
}

interface ProjectedView {
  path: string[];
  nodeIds: string[];
  nodeInfo: Map<string, NodeInfo>;
  internalEdges: AggregatedEdge[];
  displayEdges: AggregatedEdge[];
}

function classifyEdges(
  edges: { from: string; to: string }[],
  abstractModules: Set<string>
): { from: string; to: string; type: 'abstract' | 'direct' }[] {
  return edges
    .map((e) => ({
      from: e.from,
      to: e.to,
      type: (abstractModules.has(e.to) ? 'abstract' : 'direct') as 'abstract' | 'direct',
    }))
    .sort((a, b) => (a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : 1));
}

function projectView(
  architecture: ReportDataset['architecture']['architecture'],
  path: string[]
): ProjectedView {
  const abstractModules = new Set(architecture.abstractModules);
  const { nodeIds, childInfo, moduleToNode } = projectChildInfo(architecture.graph, path);

  const nodeInfo = new Map<string, NodeInfo>();
  for (const id of nodeIds) {
    const child = stripFileSuffix(id);
    const info = childInfo.get(child)!;
    const contained = [
      ...(info.exactModule !== null ? [info.exactModule] : []),
      ...info.descendants,
    ].sort();
    const isMixed = id !== child;
    const leaf = isMixed ? true : info.exactModule !== null && info.descendants.length === 0;
    const label = leaf ? (info.exactModule ?? child).split('/').pop()!.replace(/\.(ts|tsx)$/, '') : child;
    const fullName =
      leaf && info.exactModule !== null
        ? [...path, info.exactModule.split('/').pop()!].join('.')
        : [...path, child].join('.');
    nodeInfo.set(id, {
      id,
      leaf,
      label,
      fullName,
      module: leaf && info.exactModule !== null ? info.exactModule : null,
      contained,
      hasDeeper: contained.some((m) => m.split('/').length > path.length + 2),
    });
  }

  const classified = classifyEdges(architecture.graph.edges, abstractModules);

  const aggKey = (a: string, b: string): string => `${a}\u0000${b}`;
  const aggregated = new Map<string, AggregatedEdge>();
  for (const e of classified) {
    const f = moduleToNode.get(e.from);
    const t = moduleToNode.get(e.to);
    if (f === undefined || t === undefined) continue;
    if (f === t) continue;
    const key = aggKey(f, t);
    const existing = aggregated.get(key);
    if (existing) {
      existing.count += 1;
      if (e.type === 'abstract') existing.type = 'abstract';
    } else {
      aggregated.set(key, { from: f, to: t, type: e.type, count: 1 });
    }
  }
  const internalEdges = [...aggregated.values()].sort(
    (a, b) => (a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : 1)
  );

  // display edges: internal + one-endpoint-outside (raw module names kept)
  const displayEdges = new Map<string, AggregatedEdge>();
  for (const e of classified) {
    const f = moduleToNode.get(e.from);
    const t = moduleToNode.get(e.to);
    const fIn = f !== undefined;
    const tIn = t !== undefined;
    if (!fIn && !tIn) continue;
    if (fIn && tIn && f === t) continue;
    const key = aggKey(f ?? e.from, t ?? e.to);
    const existing = displayEdges.get(key);
    if (existing) {
      existing.count += 1;
      if (e.type === 'abstract') existing.type = 'abstract';
    } else {
      displayEdges.set(key, { from: f ?? e.from, to: t ?? e.to, type: e.type, count: 1 });
    }
  }
  const displayEdgeList = [...displayEdges.values()].sort(
    (a, b) => (a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to < b.to ? -1 : 1)
  );

  return { path, nodeIds, nodeInfo, internalEdges, displayEdges: displayEdgeList };
}

function shortestPath(from: string, to: string, outMap: Map<string, string[]>): string[] | null {
  const queue: string[] = [from];
  const prev = new Map<string, string | null>([[from, null]]);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === to) {
      const path: string[] = [];
      let cur: string | null = to;
      while (cur !== null) {
        path.unshift(cur);
        cur = prev.get(cur) ?? null;
      }
      return path;
    }
    for (const next of (outMap.get(node) ?? []).sort()) {
      if (!prev.has(next)) {
        prev.set(next, node);
        queue.push(next);
      }
    }
  }
  return null;
}

// One view's layering results: feedback edges, acyclic edges, cycle paths.
interface LayeringResult {
  feedback: Edge[];
  acyclic: Edge[];
  cycles: string[][];
  participants: Set<string>;
}

function computeLayering(nodeIds: string[], layoutEdges: Edge[]): LayeringResult {
  const { feedback, acyclic } = breakCycles(nodeIds, layoutEdges);

  // cycle paths: for each feedback edge (sorted), shortest path from `to` back
  // to `from` in the acyclic graph; self-loop → [from, from]
  const acycOut = new Map<string, string[]>();
  for (const n of nodeIds) acycOut.set(n, []);
  for (const e of acyclic) acycOut.get(e.from)?.push(e.to);
  for (const l of acycOut.values()) l.sort();

  const cycles: string[][] = [];
  const seenKeys = new Set<string>();
  for (const fe of feedback) {
    let cyclePath: string[];
    if (fe.from === fe.to) {
      cyclePath = [fe.from, fe.from];
    } else {
      const shortest = shortestPath(fe.to, fe.from, acycOut);
      if (shortest === null) continue;
      cyclePath = [...shortest, fe.to];
    }
    const key = cyclePath.join('\u0000');
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    cycles.push(cyclePath);
  }

  const participants = new Set<string>();
  for (const cycle of cycles) {
    for (const id of cycle) participants.add(id);
  }
  return { feedback, acyclic, cycles, participants };
}

// Full projection + layering + layout for the map view.
export function buildMapView(dataset: ReportDataset, path: string[]): MapView {
  const architecture = dataset.architecture.architecture;
  const view = projectView(architecture, path);
  const layoutEdges: Edge[] = view.internalEdges.map(({ from, to }) => ({ from, to }));
  const layering = computeLayering(view.nodeIds, layoutEdges);
  const feedbackSet = new Set(layering.feedback.map((e) => `${e.from}\u0000${e.to}`));

  // memoized subtree-cycle detection (per node id); a node is cycle-red iff it
  // participates in this level's cycle paths OR any descendant subtree is
  // cycle-red (arch4ts final semantics) — computed before layoutView so the
  // cycle callback can read it
  const cycleMemo = new Map<string, boolean>();
  const childLayeringMemo = new Map<string, LayeringResult | null>();
  const childLayeringFor = (nodeId: string): LayeringResult | null => {
    const cached = childLayeringMemo.get(nodeId);
    if (cached !== undefined) return cached;
    const info = view.nodeInfo.get(nodeId)!;
    const nodePath = [...path, stripFileSuffix(nodeId)];
    if (!info.hasDeeper) {
      childLayeringMemo.set(nodeId, null);
      return null;
    }
    const childView = projectView(architecture, nodePath);
    const childEdges: Edge[] = childView.internalEdges.map(({ from, to }) => ({ from, to }));
    const result = computeLayering(childView.nodeIds, childEdges);
    childLayeringMemo.set(nodeId, result);
    return result;
  };
  const subtreeCycles = (nodeId: string): boolean => {
    const cached = cycleMemo.get(nodeId);
    if (cached !== undefined) return cached;
    let result = layering.participants.has(nodeId);
    if (!result) {
      // descendant subtree cycles: any node in the child view flagged red
      const childLayering = childLayeringFor(nodeId);
      if (childLayering !== null) {
        const nodePath = [...path, stripFileSuffix(nodeId)];
        const childView = projectView(architecture, nodePath);
        const childRed = new Map<string, boolean>();
        for (const cid of childView.nodeIds) {
          let red = childLayering.participants.has(cid);
          if (!red) {
            const cinfo = childView.nodeInfo.get(cid)!;
            if (cinfo.hasDeeper) {
              red = redInSubtree(architecture, [...nodePath, stripFileSuffix(cid)]);
            }
          }
          childRed.set(cid, red);
        }
        result = [...childRed.values()].some(Boolean);
      }
    }
    cycleMemo.set(nodeId, result);
    return result;
  };
  // recursive red check for an arbitrary sub-path: true iff any node in the view
  // rooted at subPath participates in a cycle or has a red descendant subtree
  function redInSubtree(
    arch: ReportDataset['architecture']['architecture'],
    subPath: string[]
  ): boolean {
    const sub = projectView(arch, subPath);
    const subEdges: Edge[] = sub.internalEdges.map(({ from, to }) => ({ from, to }));
    const subLayering = computeLayering(sub.nodeIds, subEdges);
    for (const cid of sub.nodeIds) {
      if (subLayering.participants.has(cid)) return true;
      const cinfo = sub.nodeInfo.get(cid)!;
      if (cinfo.hasDeeper && redInSubtree(arch, [...subPath, stripFileSuffix(cid)])) return true;
    }
    return false;
  }

  const nodeCycle = new Map<string, boolean>();
  for (const n of view.nodeIds) {
    nodeCycle.set(n, subtreeCycles(n));
  }

  const nodes = layoutView(view.nodeIds, layoutEdges, {
    leaf: (id) => view.nodeInfo.get(id)?.leaf ?? false,
    label: (id) => view.nodeInfo.get(id)?.label ?? id,
    fullName: (id) => view.nodeInfo.get(id)?.fullName ?? id,
    module: (id) => view.nodeInfo.get(id)?.module ?? null,
    cycle: (id) => nodeCycle.get(id) ?? false,
    abstract: (id) =>
      (view.nodeInfo.get(id)?.contained ?? []).some((m) =>
        architecture.abstractModules.includes(m)
      ),
  });

  // cycle lines relative to the current path, joined with '->', deduped, sorted
  const cycleLines: string[] = [];
  const seenLines = new Set<string>();
  const pushLine = (line: string) => {
    if (!seenLines.has(line)) {
      seenLines.add(line);
      cycleLines.push(line);
    }
  };
  for (const cycle of layering.cycles) {
    pushLine(cycle.map((id) => stripFileSuffix(id)).join('->'));
  }
  for (const n of view.nodeIds) {
    if (!childLayeringFor(n)) continue;
    for (const line of subtreeCycleLines(architecture, [...path, stripFileSuffix(n)])) {
      pushLine(line);
    }
  }
  cycleLines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  // cycle lines from a subtree: this level's cycles plus deeper views, relative
  // to the sub-path, deduped across the whole list
  function subtreeCycleLines(
    arch: ReportDataset['architecture']['architecture'],
    subPath: string[]
  ): string[] {
    const sub = projectView(arch, subPath);
    const subEdges: Edge[] = sub.internalEdges.map(({ from, to }) => ({ from, to }));
    const subLayering = computeLayering(sub.nodeIds, subEdges);
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const cycle of subLayering.cycles) {
      const line = cycle.map((id) => stripFileSuffix(id)).join('->');
      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }
    for (const cid of sub.nodeIds) {
      const cinfo = sub.nodeInfo.get(cid)!;
      if (!cinfo.hasDeeper) continue;
      for (const line of subtreeCycleLines(arch, [...subPath, stripFileSuffix(cid)])) {
        if (!seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
    }
    return lines;
  }

  // edges: aggregate between children with count, keep one-endpoint-outside
  // edges with raw module names, flag cycle-break from the recomputed feedback
  const edges: EdgeView[] = view.displayEdges.map((e) => ({
    from: e.from,
    to: e.to,
    count: e.count,
    type: e.type,
    cycleBreak: feedbackSet.has(`${e.from}\u0000${e.to}`),
  }));

  void nodes;
  const sceneHeight = computeSceneHeight(nodes, cycleLines);
  return { namespacePath: path, nodes, edges, cycleLines, sceneHeight };
}

function computeSceneHeight(nodes: NodeView[], cycleLines: string[]): number {
  const maxBottom = nodes.reduce((acc, r) => Math.max(acc, r.y + r.height), 0);
  const cycleListY = maxBottom + LAYOUT.cycleTitleOffset;
  return (
    cycleListY +
    (cycleLines.length > 0
      ? LAYOUT.cycleTitleOffset + (cycleLines.length + 1) * LAYOUT.cycleLineHeight + 20
      : LAYOUT.cycleTitleOffset)
  );
}
