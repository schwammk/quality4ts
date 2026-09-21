// Map view React component: SVG scene from buildMapView with badges, hover
// dimming, client-side drill. Visual language ported from arch4ts ui/main.ts.
import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { LAYOUT, type NodeView } from './layout.js';
import { buildMapView } from './projection.js';
import { bandColor } from './bands.js';
import type { Risk, ReportDataset } from './types.js';

const MIXED_LEAF_SUFFIX = '|file';

const stripFileSuffix = (id: string): string =>
  id.endsWith(MIXED_LEAF_SUFFIX) ? id.slice(0, -MIXED_LEAF_SUFFIX.length) : id;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function centerOf(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

// point where the segment from `from` toward `toward` leaves rect r
function exitPoint(r: Rect, from: Point, toward: Point): Point {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return { x: from.x, y: from.y };
  const hw = r.width / 2;
  const hh = r.height / 2;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, hw / Math.abs(dx));
  if (dy !== 0) t = Math.min(t, hh / Math.abs(dy));
  return { x: from.x + dx * t, y: from.y + dy * t };
}

const BREAK_CHARS = ['.', '-', '_', ' '];

// split on break chars at the nearest midpoint, hard-cut fallback (arch4ts labels.ts)
function splitLabelLines(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const n = label.length;
  const target = Math.floor(n / 2);
  let best: { cut: number; keepWithLeft: boolean } | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const ch = label[i];
    if (!BREAK_CHARS.includes(ch)) continue;
    const keepWithLeft = ch === '-' || ch === '_';
    const cut = keepWithLeft ? i + 1 : i;
    const left = label.slice(0, cut).trim();
    let right = label.slice(cut).trim();
    if (ch === '.' || ch === ' ') right = right.replace(/^[./]/, '');
    if (left.length === 0 || right.length === 0) continue;
    if (left.length > maxChars || right.length > maxChars) continue;
    const score = Math.abs(i - target);
    if (score < bestScore) {
      bestScore = score;
      best = { cut, keepWithLeft };
    }
  }
  if (best !== null) {
    const left = label.slice(0, best.cut).trim();
    let right = label.slice(best.cut).trim();
    if (!best.keepWithLeft) right = right.replace(/^[./]/, '');
    return [left, right];
  }
  const hardCut = Math.max(1, Math.min(n - 1, maxChars));
  const left = label.slice(0, hardCut).trim();
  const right = label.slice(hardCut, hardCut + maxChars).trim();
  return [left, right];
}

function dominantBand(worstCrap: number | null): Risk {
  if (worstCrap === null) return 'unknown';
  if (worstCrap > 30) return 'high';
  if (worstCrap > 5) return 'moderate';
  return 'low';
}

export interface MapViewProps {
  dataset: ReportDataset;
  initialPath?: string[];
  onOpenModule: (module: string) => void;
  onNavigate?: () => void;
}

export function MapView(props: MapViewProps): JSX.Element {
  const { dataset, initialPath, onOpenModule, onNavigate } = props;
  const [path, setPath] = useState<string[]>(() => initialPath ?? []);
  const [stack, setStack] = useState<{ path: string[]; scrollX: number; scrollY: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const view = useMemo(() => buildMapView(dataset, path), [dataset, path]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingScroll = useRef<{ scrollX: number; scrollY: number } | null>(null);
  const rollupByModule = useMemo(
    () => new Map(dataset.modules.map((m) => [m.module, m])),
    [dataset]
  );

  // drill state resets when a new dataset arrives
  useEffect(() => {
    setPath(initialPath ?? []);
    setStack([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  // restore scroll after a back-pop renders the previous view
  useEffect(() => {
    if (pendingScroll.current && containerRef.current) {
      containerRef.current.scrollLeft = pendingScroll.current.scrollX;
      containerRef.current.scrollTop = pendingScroll.current.scrollY;
      pendingScroll.current = null;
    }
  }, [view]);

  // ctrl+wheel and +/- keys scale 0.25–4 via width/height (viewBox model)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z * 1.1));
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z * 0.9));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // ONE delegated listener pair for hover dimming + click drill
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onOver = (e: MouseEvent) => {
      const target = (e.target as Element).closest('[data-module]');
      if (!target) return;
      const id = target.getAttribute('data-module')!;
      svg.querySelectorAll('line[data-from], polygon[data-from]').forEach((el) => {
        const from = el.getAttribute('data-from');
        const to = el.getAttribute('data-to');
        el.classList.toggle('dimmed', from !== id && to !== id);
      });
    };
    const onOut = () => {
      svg.querySelectorAll('.dimmed').forEach((el) => el.classList.remove('dimmed'));
    };
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element).closest('[data-module]');
      if (!target) return;
      const id = target.getAttribute('data-module')!;
      const node = view.nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.leaf) {
        if (node.module !== null) {
          onOpenModule(node.module);
        }
        return;
      }
      const container = containerRef.current;
      setStack((s) => [
        ...s,
        { path, scrollX: container?.scrollLeft ?? 0, scrollY: container?.scrollTop ?? 0 },
      ]);
      setPath([...path, stripFileSuffix(id)]);
      setZoom(1);
      onNavigate?.();
    };
    svg.addEventListener('mouseover', onOver);
    svg.addEventListener('mouseout', onOut);
    svg.addEventListener('click', onClick);
    return () => {
      svg.removeEventListener('mouseover', onOver);
      svg.removeEventListener('mouseout', onOut);
      svg.removeEventListener('click', onClick);
    };
  }, [view, path, onOpenModule, onNavigate]);

  const goBack = () => {
    const prev = stack[stack.length - 1];
    if (!prev) return;
    setStack(stack.slice(0, -1));
    pendingScroll.current = { scrollX: prev.scrollX, scrollY: prev.scrollY };
    setPath(prev.path);
    setZoom(1);
    onNavigate?.();
  };

  const rectOf = new Map<string, NodeView>(view.nodes.map((n) => [n.id, n]));
  const maxBottom = view.nodes.reduce((acc, n) => Math.max(acc, n.y + n.height), 0);
  const cycleListY = maxBottom + LAYOUT.cycleTitleOffset;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '4px 8px' }}>
        <button id="map-back" onClick={goBack} disabled={stack.length === 0}>Back</button>
        <span id="map-path">{path.join('.') || '(root)'}</span>
      </div>
      <div ref={containerRef} style={{ overflow: 'auto', maxHeight: '80vh' }}>
        <svg
          ref={svgRef}
          width={1200 * zoom}
          height={view.sceneHeight * zoom}
          viewBox={`0 0 1200 ${view.sceneHeight}`}
          style={{ background: 'rgb(250,250,250)' }}
        >
          {view.edges.map((edge) => {
            const fromNode = rectOf.get(edge.from);
            const toNode = rectOf.get(edge.to);
            if (!fromNode || !toNode) return null;
            const fc = centerOf(fromNode);
            const tc = centerOf(toNode);
            const fromExit = exitPoint(fromNode, fc, tc);
            const toExit = exitPoint(toNode, tc, fc);
            const dx = toExit.x - fromExit.x;
            const dy = toExit.y - fromExit.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const baseX = toExit.x - ux * 8;
            const baseY = toExit.y - uy * 8;
            const px = -uy;
            const py = ux;
            const stroke = edge.cycleBreak ? '#c92a2a' : '#1f2430';
            return (
              <Fragment key={`edge-${edge.from}-${edge.to}`}>
                <line
                  x1={fromExit.x} y1={fromExit.y} x2={baseX} y2={baseY}
                  stroke={stroke} strokeWidth={1}
                  data-from={edge.from} data-to={edge.to}
                />
                <polygon
                  points={[
                    `${baseX + px * 5},${baseY + py * 5}`,
                    `${baseX - px * 5},${baseY - py * 5}`,
                    `${toExit.x},${toExit.y}`,
                  ].join(' ')}
                  fill={edge.type === 'abstract' ? '#c92a2a' : 'none'}
                  stroke={stroke}
                  data-from={edge.from} data-to={edge.to}
                />
              </Fragment>
            );
          })}
          {view.nodes.map((node) => (
            <Fragment key={`node-${node.id}`}>
              <rect
                x={node.x} y={node.y} width={node.width} height={node.height}
                fill={node.abstract ? 'rgb(226,242,226)' : 'rgb(225,233,242)'}
                stroke={node.leaf ? '#000' : 'rgb(120,140,160)'}
                strokeWidth={node.leaf ? 3 : 1}
                data-module={node.id}
              />
              {!node.leaf && (
                <>
                  <rect
                    x={node.x - LAYOUT.nubWidth} y={node.y + node.height / 5}
                    width={LAYOUT.nubWidth} height={node.height / 5}
                    fill="rgb(120,140,160)"
                  />
                  <rect
                    x={node.x - LAYOUT.nubWidth} y={node.y + (3 * node.height) / 5}
                    width={LAYOUT.nubWidth} height={node.height / 5}
                    fill="rgb(120,140,160)"
                  />
                </>
              )}
            </Fragment>
          ))}
          {view.edges.map((edge) => {
            if (edge.count <= 1) return null;
            const fromNode = rectOf.get(edge.from);
            const toNode = rectOf.get(edge.to);
            if (!fromNode || !toNode) return null;
            const fc = centerOf(fromNode);
            const tc = centerOf(toNode);
            return (
              <text
                key={`count-${edge.from}-${edge.to}`}
                x={(fc.x + tc.x) / 2 + 4} y={(fc.y + tc.y) / 2 - 4}
                fill="#0f141e" fontSize={10}
              >
                {edge.count}
              </text>
            );
          })}
          {view.nodes.map((node) => {
            const color = node.cycle ? '#b40000' : node.abstract ? '#008000' : '#0f141e';
            const lines = splitLabelLines(node.label, node.maxLabelChars);
            const cx = node.x + node.width / 2;
            const cy = node.y + node.height / 2;
            const startY = cy - ((lines.length - 1) * LAYOUT.lineHeight) / 2;
            return lines.map((line, i) => (
              <text
                key={`label-${node.id}-${i}`}
                x={cx} y={startY + i * LAYOUT.lineHeight}
                textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize={12}
                data-module={node.id}
              >
                {line}
              </text>
            ));
          })}
          {view.nodes
            .filter((node) => node.leaf && node.module !== null)
            .map((node) => {
              const rollup = rollupByModule.get(node.module ?? stripFileSuffix(node.id));
              const worst = rollup?.worstCrap ?? null;
              const dupes = rollup?.dupePairs ?? 0;
              const r = 9;
              const cy = node.y;
              const crapCx = node.x + node.width;
              const dryCx = node.x + node.width + 2 * r + 4;
              return (
                <Fragment key={`badges-${node.id}`}>
                  <g className="badge">
                    <circle cx={crapCx} cy={cy} r={r} style={{ fill: bandColor(dominantBand(worst)) }} />
                    <text x={crapCx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#fff">
                      {String(worst ?? '?')}
                    </text>
                    <title>{worst === null ? 'worst CRAP ?' : `worst CRAP ${worst}`}</title>
                  </g>
                  <g className="badge">
                    <circle cx={dryCx} cy={cy} r={r} style={{ fill: dupes > 0 ? 'var(--danger)' : 'var(--text-muted)' }} />
                    <text x={dryCx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#fff">
                      {String(dupes)}
                    </text>
                    <title>{`${dupes} duplicate pair${dupes === 1 ? '' : 's'}`}</title>
                  </g>
                </Fragment>
              );
            })}
          {view.cycleLines.length > 0 && (
            <>
              <text x={20} y={cycleListY} fill="rgb(120,0,0)" fontSize={14}>Cycles:</text>
              {view.cycleLines.map((line, i) => (
                <text
                  key={`cycle-${i}`}
                  x={20} y={cycleListY + 20 + i * LAYOUT.cycleLineHeight}
                  fill="rgb(150,0,0)" fontSize={12}
                >
                  {line}
                </text>
              ))}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
