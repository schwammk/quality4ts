import { useCallback, useEffect, useState } from 'react';
import { fetchReport, postScan } from './api.js';
import type { ReportDataset } from './types.js';

const TABS = ['Map', 'Hotspots', 'Duplicates'] as const;
export type Tab = (typeof TABS)[number];

export function App() {
  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [tab, setTab] = useState<Tab>('Map');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setDataset(await fetchReport()); } catch (e) { setError(String((e as Error).message)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reanalyze = useCallback(async () => {
    setScanning(true);
    try { setDataset(await postScan()); } catch (e) { setError(String((e as Error).message)); }
    finally { setScanning(false); }
  }, []);

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 16px', borderBottom: '1px solid #ddd' }}>
        <strong>quality4ts</strong>
        {dataset && <span>{dataset.meta.target}</span>}
        {dataset && <span style={{ color: '#8a9199', fontSize: 12 }}>generated {dataset.meta.generatedAt}</span>}
        <button id="reanalyze" disabled={scanning} onClick={reanalyze}>{scanning ? 'Scanning…' : 'Reanalyze'}</button>
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map((t) => (
            <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      {error && <div style={{ color: '#c92a2a', padding: '4px 16px' }}>{error}</div>}
      <main id="view" style={{ padding: 8 }}>
        {dataset === null
          ? <div>{scanning ? 'Scanning…' : 'Loading…'}</div>
          : <div data-tab={tab}>placeholder for {tab} (wired in later tasks)</div>}
      </main>
    </div>
  );
}
