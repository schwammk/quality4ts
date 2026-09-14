import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface StubBins {
  dir: string;
  crap4ts: string;
  dry4ts: string;
  arch4ts: string;
}

export function makeStubBins(cannedDir: string): StubBins {
  const dir = mkdtempSync(join(tmpdir(), 'q4ts-stubs-'));
  const write = (name: string, body: string): string => {
    const bin = join(dir, name);
    writeFileSync(bin, body);
    chmodSync(bin, 0o755);
    return bin;
  };
  const canned = (name: string): string => readFileSync(join(cannedDir, name), 'utf8')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return {
    dir,
    // exits 1 ON PURPOSE: findings exceeded the threshold — still a valid tool run
    crap4ts: write('crap4ts', `#!/bin/sh\nprintf "${canned('canned-crap.json')}"\nexit 1\n`),
    dry4ts: write('dry4ts', `#!/bin/sh\nprintf "${canned('canned-dry.json')}"\n`),
    arch4ts: write('arch4ts', `#!/bin/sh\ncat "${join(cannedDir, 'canned-arch.json')}" > "$4"\n`),
  };
}

export function dropStubBins(bins: StubBins): void {
  rmSync(bins.dir, { recursive: true });
}
