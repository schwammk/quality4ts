import { useEffect, useRef, useState } from 'react';
import { fetchSource } from './api.js';
import { highlightSource } from './highlight.js';

interface Pair {
  leftFile: string;
  leftLine: number;
  rightFile: string;
  rightLine: number;
}

const LINE_HEIGHT = 18;

function renderLines(content: string, hlLine: number | null) {
  return content.replace(/\n$/, '').split('\n').map((l, i) => (
    <div key={i} className={`line${hlLine !== null && i + 1 === hlLine ? ' hl' : ''}`} data-line={i + 1}
      dangerouslySetInnerHTML={{ __html: `<span class="ln">${i + 1}</span>  ${highlightSource(l)}` }} />
  ));
}

export function PairView(props: { pair: Pair | null; onClose: () => void }) {
  const [contents, setContents] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [error, setError] = useState<string | null>(null);
  const leftRef = useRef<HTMLPreElement | null>(null);
  const rightRef = useRef<HTMLPreElement | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    setContents({ left: null, right: null });
    setError(null);
    if (!props.pair) return;
    let stale = false;
    // fetch both files once here — never re-fetch the same file twice
    Promise.all([fetchSource(props.pair.leftFile), fetchSource(props.pair.rightFile)])
      .then(([l, r]) => { if (!stale) setContents({ left: l.content, right: r.content }); })
      .catch((e) => { if (!stale) setError(String((e as Error).message)); });
    return () => { stale = true; };
  }, [props.pair?.leftFile, props.pair?.leftLine, props.pair?.rightFile, props.pair?.rightLine]);

  useEffect(() => {
    if (!props.pair || contents.left === null || contents.right === null) return;
    syncing.current = true;
    if (leftRef.current) leftRef.current.scrollTop = Math.max(0, (props.pair.leftLine - 1) * LINE_HEIGHT);
    if (rightRef.current) rightRef.current.scrollTop = Math.max(0, (props.pair.rightLine - 1) * LINE_HEIGHT);
    const t = setTimeout(() => { syncing.current = false; }, 50);
    return () => clearTimeout(t);
  }, [contents, props.pair]);

  const linkFrom = (from: 'left' | 'right') => () => {
    if (syncing.current) return;
    const src = from === 'left' ? leftRef.current : rightRef.current;
    const dst = from === 'left' ? rightRef.current : leftRef.current;
    if (!src || !dst) return;
    const delta = dst.scrollTop - src.scrollTop;
    if (Math.abs(delta) > 1) {
      syncing.current = true;
      dst.scrollTop = src.scrollTop;
      syncing.current = false;
    }
  };

  if (!props.pair) return null;
  return (
    <aside style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 30, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #eee' }}>
        <span style={{ fontSize: 12 }}>
          <code>{props.pair.leftFile}</code> ↔ <code>{props.pair.rightFile}</code>
        </span>
        <button onClick={props.onClose}>✕</button>
      </header>
      {error && <div style={{ color: '#c92a2a', padding: 8 }}>{error}</div>}
      {contents.left === null || contents.right === null
        ? !error && <div style={{ padding: 8 }}>Loading…</div>
        : (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <pre ref={leftRef} onScroll={linkFrom('left')}
              style={{ flex: 1, overflow: 'auto', margin: 0, fontSize: 12, lineHeight: `${LINE_HEIGHT}px`, borderRight: '1px solid #ddd' }}>
              {renderLines(contents.left, props.pair.leftLine)}
            </pre>
            <pre ref={rightRef} onScroll={linkFrom('right')}
              style={{ flex: 1, overflow: 'auto', margin: 0, fontSize: 12, lineHeight: `${LINE_HEIGHT}px` }}>
              {renderLines(contents.right, props.pair.rightLine)}
            </pre>
          </div>
        )}
    </aside>
  );
}
