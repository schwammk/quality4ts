import type { Risk } from './types.js';

export function bandColor(risk: Risk): string {
  switch (risk) {
    case 'low': return '#2f8f4e';
    case 'moderate': return '#d99a1b';
    case 'high': return '#c92a2a';
    case 'unknown': return '#8a9199';
  }
}

export function bandLabel(risk: Risk): string {
  return risk;
}
