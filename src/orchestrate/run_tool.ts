import { spawn } from 'node:child_process';
import { CliError } from '../cli-error.js';

export async function runSiblingTool(bin: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout!.on('data', (chunk: Buffer) => (out += chunk));
    child.stderr!.on('data', (chunk: Buffer) => (err += chunk));
    child.on('error', (e) => reject(new CliError(`cannot run '${bin}': ${e.message}`)));
    child.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        const tail = err.trim().split('\n').slice(-5).join('\n');
        reject(
          new CliError(
            `'${bin}' produced no JSON on stdout (this tool exits nonzero when findings exceed thresholds, but its stdout must always be JSON when a format is requested)\n${tail}`,
          ),
        );
      }
    });
  });
}
