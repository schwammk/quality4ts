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
});
