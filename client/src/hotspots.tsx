import { useMemo, useState } from 'react';
import { bandColor } from './bands.js';
import type { FunctionFinding, ReportDataset, Risk } from './types.js';

export type SortKey = 'crap' | 'cc' | 'name' | 'file';

const RISKS: (Risk | 'all')[] = ['all', 'low', 'moderate', 'high', 'unknown'];

export function sortFunctions(functions: FunctionFinding[], key: SortKey, dir: 1 | -1): FunctionFinding[] {
  const val = (f: FunctionFinding): string | number | null => {
    switch (key) {
      case 'crap': return f.crap;
      case 'cc': return f.cc;
      case 'name': return f.name;
      case 'file': return f.file;
    }
  };
  return [...functions].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (key === 'crap') {
      const na = va === null;
      const nb = vb === null;
      if (na !== nb) return na ? 1 : -1;
    }
    if (va === vb) {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
    }
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va < vb ? -1 : 1) * dir;
  });
}

export function filterByRisk(functions: FunctionFinding[], risk: Risk | 'all'): FunctionFinding[] {
  if (risk === 'all') return functions;
  return functions.filter((f) => f.risk === risk);
}

export function Hotspots(props: {
  dataset: ReportDataset;
  moduleFilter: string | null;
  onOpenFunction: (file: string, startLine: number) => void;
  onClearModule?: () => void;
  onBackToMap?: () => void;
}) {
  const { dataset, moduleFilter, onOpenFunction, onClearModule, onBackToMap } = props;
  const [key, setKey] = useState<SortKey>('crap');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [risk, setRisk] = useState<Risk | 'all'>('all');

  const fileToModule = useMemo(() => {
    const m: Record<string, string> = {};
    const map = dataset.architecture.architecture.moduleToSourceFile;
    for (const [module, file] of Object.entries(map)) m[file] = module;
    for (const node of dataset.architecture.architecture.graph.nodes) {
      if (!(node in m)) m[node] = node;
    }
    return m;
  }, [dataset]);

  const visible = sortFunctions(
    filterByRisk(
      moduleFilter
        ? dataset.functions.filter((f) => fileToModule[f.file] === moduleFilter)
        : dataset.functions,
      risk,
    ),
    key,
    dir,
  );

  const clickHeader = (k: SortKey) => {
    if (k === key) setDir((d) => (d === 1 ? -1 : 1));
    else { setKey(k); setDir(k === 'crap' || k === 'cc' ? -1 : 1); }
  };
  const indicator = (k: SortKey) => (k === key ? (dir === 1 ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {RISKS.map((r) => (
          <button key={r} data-filter={r} className={`chip${risk === r ? ' active' : ''}`} onClick={() => setRisk(r)}>
            {r === 'all' ? 'All' : r}
          </button>
        ))}
        {moduleFilter && (
          <>
            {onBackToMap && <button onClick={onBackToMap}>↩ Map</button>}
            <button onClick={() => onClearModule?.()}>module: {moduleFilter} ✕</button>
          </>
        )}
      </div>
      <table>
        <thead>
          <tr>
            {['file', 'name', 'cc'].map((k) => (
              <th key={k} onClick={() => clickHeader(k as SortKey)}>{k === 'file' ? 'File' : k === 'name' ? 'Function' : 'CC'}{indicator(k as SortKey)}</th>
            ))}
            <th>Coverage</th>
            <th onClick={() => clickHeader('crap')}>CRAP{indicator('crap')}</th>
            <th>Risk</th>
            <th>Dupes</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((f) => (
            <tr key={`${f.file}:${f.name}:${f.startLine}`} data-file={f.file} data-name={f.name} onClick={() => onOpenFunction(f.file, f.startLine)}>
              <td>{f.file}</td>
              <td>{f.name}</td>
              <td>{f.cc}</td>
              <td>{f.coverage === null ? '?' : `${Math.round(f.coverage * 100)}%`}</td>
              <td>
                <span className="badge" style={{ background: bandColor(f.risk) }}>{f.crap ?? '?'}</span>
              </td>
              <td>{f.risk}</td>
              <td>{f.dupes.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
