import { useEffect, useRef, useState } from 'react';
import { fetchSource } from './api.js';
import { highlightSource } from './highlight.js';

export function SourcePanel(props: { selection: { file: string; line: number } | null; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widthPx, setWidthPx] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem('q4ts:source-width'));
    return Number.isFinite(stored) && stored >= 360 ? stored : null;
  });
  const asideRef = useRef<HTMLElement | null>(null);

  const onResizeDoubleClick = (): void => {
    localStorage.removeItem('q4ts:source-width');
    setWidthPx(null);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent): void => {
      const w = Math.min(window.innerWidth - ev.clientX, window.innerWidth - 480);
      const next = Math.max(360, w);
      setWidthPx(next);
      localStorage.setItem('q4ts:source-width', String(next));
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    setContent(null);
    setError(null);
    if (!props.selection) return;
    let stale = false;
    fetchSource(props.selection.file)
      .then((r) => { if (!stale) setContent(r.content); })
      .catch((e) => { if (!stale) setError(String((e as Error).message)); });
    return () => { stale = true; };
  }, [props.selection?.file, props.selection?.line]);

  useEffect(() => {
    asideRef.current?.querySelector('.hl')?.scrollIntoView({ block: 'center' });
  }, [content, props.selection?.line]);

  if (!props.selection) return null;
  const lines = (content ?? '').replace(/\n$/, '').split('\n');
  return (
    <aside ref={asideRef} data-width={widthPx != null ? String(widthPx) : ''} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: widthPx != null ? `${widthPx}px` : 'min(42vw, 760px)', minWidth: 360, background: '#fff', borderLeft: '1px solid #ddd', overflow: 'hidden', zIndex: 20 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #eee' }}>
          <code style={{ fontSize: 12 }}>{props.selection.file}</code>
          <button onClick={props.onClose}>✕</button>
        </header>
        {error && <div style={{ color: '#c92a2a', padding: 8 }}>{error}</div>}
        {content === null && !error && <div style={{ padding: 8 }}>Loading…</div>}
        {content !== null && (
          <pre style={{ margin: 0, fontSize: 12, lineHeight: '18px' }}>
            {lines.map((l, i) => (
              <div key={i} className={`line${i + 1 === props.selection!.line ? ' hl' : ''}`} data-line={i + 1}
                dangerouslySetInnerHTML={{ __html: `<span class="ln">${i + 1}</span>  ${highlightSource(l)}` }} />
            ))}
          </pre>
        )}
      </div>
      <div
        data-testid="source-resize"
        title="Drag to resize, double-click to reset"
        onPointerDown={onResizePointerDown}
        onDoubleClick={onResizeDoubleClick}
        style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 6, cursor: 'col-resize', touchAction: 'none' }}
      />
    </aside>
  );
}
