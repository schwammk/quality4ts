// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../client/src/app.js';

const SAMPLE = {
  meta: {
    generatedAt: '2026-09-14T00:00:00.000Z', target: '/tgt',
    thresholds: { maxCrap: 30, dryThreshold: 0.82 },
    tools: { arch4ts: null, crap4ts: null, dry4ts: null },
  },
  architecture: { architecture: { graph: { nodes: [], edges: [] }, abstractModules: [], moduleToSourceFile: {} }, layering: { layers: [] } },
  functions: [], duplicates: [], modules: [], unattributed: { files: [], functionCount: 0 },
};

describe('App shell', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(SAMPLE), { status: 200, headers: { 'content-type': 'application/json' } })));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    container.remove();
  });

  it('renders tabs and the meta header once the report arrives', async () => {
    await act(async () => { root.render(<App />); });
    const text = container.textContent ?? '';
    expect(text).toContain('Map');
    expect(text).toContain('Hotspots');
    expect(text).toContain('Duplicates');
    expect(text).toContain('/tgt');
    expect(container.querySelectorAll('.tab-btn').length).toBe(3);
  });
});
