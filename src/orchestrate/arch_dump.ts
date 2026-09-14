import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { CliError } from '../cli-error.js';

export async function runArch4tsDump(bin: string, target: string, outFile: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['dump', target, '--out', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr!.on('data', (chunk: Buffer) => (err += chunk));
    child.on('error', (e) => reject(new CliError(`cannot run '${bin}': ${e.message}`)));
    child.on('close', () => {
      if (!existsSync(outFile)) {
        reject(new CliError(`'${bin} dump' wrote no output file\n${err.trim().split('\n').slice(-5).join('\n')}`));
        return;
      }
      try {
        resolve(JSON.parse(readFileSync(outFile, 'utf8')));
      } catch (e) {
        reject(new CliError(`'${bin} dump' output is not JSON: ${(e as Error).message}`));
      }
    });
  });
}
