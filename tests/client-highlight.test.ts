import { describe, expect, it } from 'vitest';
import { highlightSource } from '../client/src/highlight.js';

describe('highlightSource', () => {
  it('escapes HTML and wraps keywords, strings, comments, numbers', () => {
    const out = highlightSource('const s = "a<b"; // note');
    expect(out).toContain('&lt;b');
    expect(out).toContain('<span class="tok-key">const</span>');
    expect(out).toContain('<span class="tok-str">"a&lt;b"</span>');
    expect(out).toContain('<span class="tok-com">// note</span>');
  });

  it('wraps numbers but not identifier fragments', () => {
    expect(highlightSource('x1 + 42')).toContain('<span class="tok-num">42</span>');
    expect(highlightSource('x1')).not.toContain('tok-num');
  });
});
