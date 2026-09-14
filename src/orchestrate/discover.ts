import { spawnSync } from 'node:child_process';
import { CliError } from '../cli-error.js';

export function discoverBin(name: string, override?: string, extraPath?: string): string {
  if (override) return override;
  const path = extraPath ? `${extraPath}:/usr/bin:/bin` : process.env.PATH ?? '';
  const res = spawnSync('sh', ['-c', `command -v '${name}'`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: path },
  });
  const bin = res.stdout.trim();
  if (!bin) {
    throw new CliError(
      `cannot find '${name}' on PATH — install it (git clone + npm link) or pass --${name}-bin`,
    );
  }
  return bin;
}
