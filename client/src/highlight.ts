const KEYWORDS = new Set(['abstract', 'any', 'as', 'asserts', 'async', 'await', 'boolean', 'break', 'case', 'catch', 'class', 'const', 'continue', 'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'namespace', 'never', 'new', 'null', 'number', 'object', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'set', 'static', 'string', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'union', 'unknown', 'var', 'void', 'while', 'yield']);

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const TOKEN_RE = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

export function highlightSource(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    out += escapeHtml(code.slice(last, idx));
    const [full, comment, str, num, word] = m;
    if (comment !== undefined) out += `<span class="tok-com">${escapeHtml(comment)}</span>`;
    else if (str !== undefined) out += `<span class="tok-str">${escapeHtml(str)}</span>`;
    else if (num !== undefined) out += `<span class="tok-num">${escapeHtml(num)}</span>`;
    else if (word !== undefined && KEYWORDS.has(word)) out += `<span class="tok-key">${escapeHtml(word)}</span>`;
    else out += escapeHtml(full);
    last = idx + full.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}
