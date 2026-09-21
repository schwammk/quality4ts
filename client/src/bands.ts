import type { Risk } from './types.js';

export function bandColor(risk: Risk): string {
  switch (risk) {
    case 'low': return 'var(--success)';
    case 'moderate': return 'var(--warning)';
    case 'high': return 'var(--danger)';
    case 'unknown': return 'var(--text-muted)';
  }
}

export function bandLabel(risk: Risk): string {
  return risk;
}
