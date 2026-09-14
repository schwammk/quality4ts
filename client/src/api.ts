import type { ReportDataset } from './types.js';

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
}

export async function fetchReport(): Promise<ReportDataset> {
  return (await ensureOk(await fetch('/api/report'))).json();
}

export async function postScan(): Promise<ReportDataset> {
  return (await ensureOk(await fetch('/api/scan', { method: 'POST' }))).json();
}

export async function fetchSource(file: string): Promise<{ content: string; totalLines: number }> {
  return (await ensureOk(await fetch(`/api/source?file=${encodeURIComponent(file)}`))).json();
}
