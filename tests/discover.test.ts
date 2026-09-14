import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverBin } from '../src/orchestrate/discover.js';
import { CliError } from '../src/cli-error.js';

function makeStubDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'q4ts-discover-'));
  const bin = join(dir, 'fake4ts');
  writeFileSync(bin, '#!/bin/sh\nexit 0\n');
  chmodSync(bin, 0o755);
  return dir;
}

describe('discoverBin', () => {
  it('prefers an explicit override without touching PATH', () => {
    const dir = makeStubDir();
    const bin = join(dir, 'fake4ts');
    expect(discoverBin('fake4ts', bin)).toBe(bin);
    rmSync(dir, { recursive: true });
  });

  it('resolves from PATH', () => {
    const dir = makeStubDir();
    const found = discoverBin('fake4ts', undefined, dir);
    expect(found).toBe(join(dir, 'fake4ts'));
    rmSync(dir, { recursive: true });
  });

  it('throws a CliError naming the override flag when missing', () => {
    expect(() => discoverBin('fake4ts', undefined, '/nonexistent-path-dir'))
      .toThrow(CliError);
    expect(() => discoverBin('fake4ts', undefined, '/nonexistent-path-dir'))
      .toThrow('--fake4ts-bin');
  });
});
