// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcePanel } from '../client/src/sourcepanel.js';

const SRC = 'line one\nline two\nline three\n';

describe('SourcePanel', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: SRC, totalLines: 3 }), { status: 200 })));
  });
  afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); container.remove(); });

  it('fetches and renders numbered, highlighted lines with the target line marked', async () => {
    await act(async () => { root.render(<SourcePanel selection={{ file: 'src/a.ts', line: 2 }} onClose={() => {}} />); });
    const lines = container.querySelectorAll('pre .line');
    expect(lines.length).toBe(3);
    expect(container.querySelector('.line[data-line="2"]')?.className).toContain('hl');
    expect(container.querySelector('pre')?.innerHTML).toContain('line');
  });

  it('shows nothing (closed) when selection is null', async () => {
    await act(async () => { root.render(<SourcePanel selection={null} onClose={() => {}} />); });
    expect(container.querySelector('aside')).toBeNull();
  });

  it('dragging the left edge resizes the pane and persists the width', async () => {
    await act(async () => { root.render(<SourcePanel selection={{ file: 'src/a.ts', line: 1 }} onClose={() => {}} />); });
    const handle = container.querySelector('[data-testid="source-resize"]') as HTMLElement;
    expect(handle).not.toBeNull();
    await act(async () => { handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 600 })); });
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 })); });
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.width).toBe(`${window.innerWidth - 600}px`);
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup')); });
    expect(localStorage.getItem('q4ts:source-width')).toBe(`${window.innerWidth - 600}`);
  });

  it('applies a persisted width on mount', async () => {
    localStorage.setItem('q4ts:source-width', '700');
    await act(async () => { root.render(<SourcePanel selection={{ file: 'src/a.ts', line: 1 }} onClose={() => {}} />); });
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.width).toBe('700px');
  });

  it('double-clicking the edge resets the width to the default', async () => {
    localStorage.setItem('q4ts:source-width', '700');
    await act(async () => { root.render(<SourcePanel selection={{ file: 'src/a.ts', line: 1 }} onClose={() => {}} />); });
    const handle = container.querySelector('[data-testid="source-resize"]') as HTMLElement;
    await act(async () => { handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.getAttribute('data-width')).toBe('');
    expect(localStorage.getItem('q4ts:source-width')).toBeNull();
  });
});
