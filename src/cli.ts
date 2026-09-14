#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ScanService, type ScanOptions } from './server/api.js';
import { startServer } from './server/server.js';
import { CliError } from './cli-error.js';

export interface Config {
  command: 'scan' | 'serve' | 'help';
  positional: string | null;
  out: string | null;
  port: number;
  noOpen: boolean;
  deferScan: boolean;
  maxCrap: number;
  dryThreshold: number;
  coverageCommand: string | null;
  useExistingCoverage: boolean;
  lcov: string[];
  bins: { crap4ts?: string; dry4ts?: string; arch4ts?: string };
}

const HELP = `quality4ts — combined quality dashboard (crap4ts + dry4ts + arch4ts)

  quality4ts scan [path] --out <file>    run all tools, write merged JSON
  quality4ts serve [path]                run all tools, serve the dashboard

Scan flags:
  --out <file>              output path for scan (required for scan)
  --max-crap <n>            CRAP threshold (default 30)
  --dry-threshold <n>       duplication threshold (default 0.82)
  --coverage-command <cmd>  run tests with coverage via this command
  --use-existing-coverage   read LCOV only, run nothing
  --lcov <file>             lcov path; repeatable
  --crap4ts-bin <path>      explicit crap4ts binary
  --dry4ts-bin <path>       explicit dry4ts binary
  --arch4ts-bin <path>      explicit arch4ts binary

Serve flags: --port <n> (default 4174), --no-open, --defer-scan
`;

export function parseArgs(argv: string[]): Config {
  const config: Config = {
    command: 'help', positional: null, out: null, port: 4174, noOpen: false, deferScan: false,
    maxCrap: 30, dryThreshold: 0.82, coverageCommand: null, useExistingCoverage: false, lcov: [], bins: {},
  };
  const first = argv[0];
  if (first === undefined || first.startsWith('--')) {
    if (first === undefined || first === '--help') return config;
    throw new CliError(`unknown command: ${first} (expected scan or serve)`);
  }
  if (first !== 'scan' && first !== 'serve' && first !== 'help') {
    throw new CliError(`unknown command: ${first} (expected scan or serve)`);
  }
  config.command = first;
  const ints = new Set(['--port', '--max-crap', '--dry-threshold']);
  const strings = new Set(['--out', '--coverage-command', '--crap4ts-bin', '--dry4ts-bin', '--arch4ts-bin']);
  const flags = new Set(['--help', '--no-open', '--defer-scan', '--use-existing-coverage']);
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (flags.has(arg)) {
      if (arg === '--no-open') config.noOpen = true;
      if (arg === '--defer-scan') config.deferScan = true;
      if (arg === '--use-existing-coverage') config.useExistingCoverage = true;
      continue;
    }
    if (arg === '--lcov') { config.lcov.push(argv[++i] ?? ''); continue; }
    if (arg === '--crap4ts-bin') { config.bins.crap4ts = argv[++i]; continue; }
    if (arg === '--dry4ts-bin') { config.bins.dry4ts = argv[++i]; continue; }
    if (arg === '--arch4ts-bin') { config.bins.arch4ts = argv[++i]; continue; }
    if (ints.has(arg) || strings.has(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new CliError(`${arg} requires a value`);
      if (arg === '--port') config.port = parseIntOr(value, '--port');
      if (arg === '--max-crap') config.maxCrap = parseIntOr(value, '--max-crap');
      if (arg === '--dry-threshold') config.dryThreshold = parseFloatOr(value, '--dry-threshold');
      if (arg === '--out') config.out = value;
      if (arg === '--coverage-command') config.coverageCommand = value;
      continue;
    }
    if (arg.startsWith('--')) throw new CliError(`unknown flag: ${arg}`);
    if (config.positional !== null) throw new CliError(`unexpected extra argument: ${arg}`);
    config.positional = arg;
  }
  if (config.command === 'scan' && !config.out && config.positional !== null) throw new CliError('scan requires --out <file>');
  return config;
}

function parseIntOr(value: string, flag: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) throw new CliError(`${flag} must be a positive integer, got: ${value}`);
  return n;
}

function parseFloatOr(value: string, flag: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) throw new CliError(`${flag} must be in (0, 1], got: ${value}`);
  return n;
}

export async function main(argv: string[]): Promise<number> {
  try {
    const config = parseArgs(argv);
    if (config.command === 'help') {
      process.stdout.write(HELP);
      return 0;
    }
    const projectRoot = resolve(config.positional ?? '.');
    if (config.command === 'scan') {
      if (!config.out) throw new CliError('scan requires --out <file>');
      const service = scanService(config, projectRoot);
      const dataset = await service.scan();
      writeFileSync(config.out!, JSON.stringify(dataset, null, 2) + '\n');
      process.stdout.write(`wrote ${config.out}\n`);
      return 0;
    }
    await serveCommand(config, projectRoot);
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
}

export function scanService(config: Config, projectRoot: string): ScanService {
  const options: ScanOptions = {
    maxCrap: config.maxCrap,
    dryThreshold: config.dryThreshold,
    bins: config.bins,
  };
  if (config.coverageCommand || config.useExistingCoverage || config.lcov.length > 0) {
    options.coverage = { command: config.coverageCommand ?? undefined, useExisting: config.useExistingCoverage, lcov: config.lcov };
  }
  return new ScanService(projectRoot, options);
}

export async function serveCommand(config: Config, projectRoot: string): Promise<{ port: number; close(): Promise<void> }> {
  const service = scanService(config, projectRoot);
  if (!config.deferScan) {
    process.stdout.write('scanning (arch4ts, crap4ts, dry4ts)...\n');
    await service.scan();
  }
  const handle = await startServer(service, { port: config.port });
  const url = `http://127.0.0.1:${handle.port}`;
  process.stdout.write(`quality4ts serving ${projectRoot} at ${url}\n`);
  if (!config.noOpen) openBrowser(url);
  return handle;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* headless machines: ignore */ });
    child.unref();
  } catch { /* ignore */ }
}

const IS_MAIN = process.argv[1] !== undefined && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (IS_MAIN) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    process.stderr.write(String((e as Error).stack ?? e) + '\n');
    process.exitCode = 1;
  });
}
