import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSiblingTool } from '../src/orchestrate/run_tool.js';
import { CliError } from '../src/cli-error.js';

function stub(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'q4ts-run-'));
  const bin = join(dir, name);
  writeFileSync(bin, body);
  chmodSync(bin, 0o755);
  return bin;
}

function jsonBin(payload: unknown, exitCode = 0): string {
  return stub('tool4ts', `#!/bin/sh\necho '${JSON.stringify(payload)}'\nexit ${exitCode}\n`);
}

describe('runSiblingTool', () => {
  it('parses stdout JSON on exit code 0', async () => {
    const bin = jsonBin([{ a: 1 }]);
    await expect(runSiblingTool(bin, [])).resolves.toEqual([{ a: 1 }]);
  });

  it('exit code 1 with valid JSON is still a finding, not an error', async () => {
    const bin = jsonBin([{ a: 2 }], 1);
    await expect(runSiblingTool(bin, [])).resolves.toEqual([{ a: 2 }]);
  });

  it('rejects with CliError when stdout is not JSON, stderr tail included', async () => {
    const bin = stub('tool4ts', '#!/bin/sh\necho "boom" >&2\nexit 2\n');
    await expect(runSiblingTool(bin, [])).rejects.toThrow(CliError);
    await expect(runSiblingTool(bin, [])).rejects.toThrow(/boom/);
  });

  it('passes args through to the binary', async () => {
    const bin = stub('tool4ts', '#!/bin/sh\necho "{\\"args\\": \\"$1 $2\\"}"\n');
    await expect(runSiblingTool(bin, ['x', 'y'])).resolves.toEqual({ args: 'x y' });
  });
});
