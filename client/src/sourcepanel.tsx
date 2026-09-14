import { useEffect, useRef, useState } from 'react';
import { fetchSource } from './api.js';
import { highlightSource } from './highlight.js';

export function SourcePanel(props: { selection: { file: string; line: number } | null; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

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
  }, [content]);

  if (!props.selection) return null;
  const lines = (content ?? '').replace(/\n$/, '').split('\n');
  return (
    <aside ref={asideRef} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', borderLeft: '1px solid #ddd', overflow: 'auto', zIndex: 20 }}>
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
    </aside>
  );
}
