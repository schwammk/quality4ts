import { describe, expect, it } from 'vitest';
import { bandColor, bandLabel } from '../client/src/bands.js';

describe('band helpers', () => {
  it('maps each risk to a distinct color and label', () => {
    const colors = (['low', 'moderate', 'high', 'unknown'] as const).map(bandColor);
    expect(new Set(colors).size).toBe(4);
    expect(bandLabel('unknown')).toBe('unknown');
  });
});
