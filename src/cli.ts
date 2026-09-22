#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Command, CommanderError } from 'commander';
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
  quality4ts --help <option>             extended help for one option, e.g. --help max-crap

Options:
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

export const EXTENDED_HELP: Record<string, string> = {
  out: `--out <file>  (scan)
Destination for the merged report JSON. Relative paths resolve against the
current working directory. Required for scan; serve ignores it because it
keeps the scan result in memory and serves it directly.`,
  'max-crap': `--max-crap <n>  (default 30)
CRAP threshold in points. Functions scoring above this are flagged as
high-risk in the Hotspots tab and get red badges on the map. CRAP grows
quadratically with cyclomatic complexity and explodes as line coverage
drops; 30 is the usual rule of thumb (complexity 4 at ~80% coverage).
Lower it to make the dashboard stricter, raise it for legacy codebases
with broad untested code. Needs coverage data — see --coverage-command.`,
  'dry-threshold': `--dry-threshold <n>  (default 0.82)
Similarity score above which a duplicated token sequence is reported by
dry4ts, in (0, 1]. Lower values report more, shorter clones (noisier);
higher values only flag near-identical blocks.`,
  'coverage-command': `--coverage-command <cmd>
Shell command run in the scan target to produce coverage. It must emit
LCOV (e.g. "npx vitest run --coverage.enabled --coverage.reporter=lcov").
crap4ts pairs each function with its covered line count from that LCOV
to compute CRAP. Without coverage (and without --use-existing-coverage)
every function counts as uncovered and shows risk 'unknown'.`,
  'use-existing-coverage': `--use-existing-coverage
Skip running the coverage command; the LCOV files given with --lcov are
read instead. Useful in CI where coverage already ran. Requires at least
one --lcov path. Functions without a matching LCOV record count as
uncovered for CRAP purposes.`,
  lcov: `--lcov <file>  (repeatable)
LCOV file consumed with --use-existing-coverage. Repeat to merge several
files (e.g. per-package reports). At least one path is required when
--use-existing-coverage is set.`,
  'crap4ts-bin': `--crap4ts-bin <path>
Explicit path to the crap4ts CLI (usually its dist/cli.js). By default
crap4ts is looked up on PATH (install via git clone + npm link); pass
this to use a local build or a pinned version.`,
  'dry4ts-bin': `--dry4ts-bin <path>
Explicit path to the dry4ts CLI (usually its dist/cli.js). By default
dry4ts is looked up on PATH (install via git clone + npm link); pass
this to use a local build or a pinned version.`,
  'arch4ts-bin': `--arch4ts-bin <path>
Explicit path to the arch4ts CLI (usually its dist/cli.js). By default
arch4ts is looked up on PATH (install via git clone + npm link); pass
this to use a local build or a pinned version.`,
  port: `--port <n>  (default 4174, serve only)
Port the dashboard HTTP server listens on. Must be a positive integer.`,
  'no-open': `--no-open  (serve only)
Do not open the browser automatically after the server starts. Useful
for CI, containers, or remote sessions.`,
  'defer-scan': `--defer-scan  (serve only)
Start the server without running the scan first. The scan then runs
lazily on the first dashboard load (GET /api/report) and is cached from
there on.`,
};

export function extendedHelp(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--help' && argv[i] !== '-h') continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('-')) {
      const text = EXTENDED_HELP[next];
      if (text !== undefined) return text;
    }
    return null;
  }
  return null;
}

export function parseArgs(argv: string[]): Config {
  const config: Config = {
    command: 'help', positional: null, out: null, port: 4174, noOpen: false, deferScan: false,
    maxCrap: 30, dryThreshold: 0.82, coverageCommand: null, useExistingCoverage: false, lcov: [], bins: {},
  };
  if (argv.length === 0 || argv[0] === 'help') return config;
  if (argv.some((a) => a === '--help' || a === '-h')) return { ...config, command: 'help' };

  const program = new Command('quality4ts');
  program.exitOverride();
  program.configureOutput({ writeErr: () => {} });
  program
    .description('combined quality dashboard (crap4ts + dry4ts + arch4ts)')
    .option('--out <file>', 'output path for scan (required for scan)')
    .option('--port <n>', 'server port (serve)', (v: string) => parseIntOr(v, '--port'), 4174)
    .option('--max-crap <n>', 'CRAP threshold', (v: string) => parseIntOr(v, '--max-crap'), 30)
    .option('--dry-threshold <n>', 'duplication threshold', (v: string) => parseFloatOr(v, '--dry-threshold'), 0.82)
    .option('--coverage-command <cmd>', 'run tests with coverage via this command')
    .option('--use-existing-coverage', 'read LCOV only, run nothing')
    .option('--lcov <file>', 'lcov path (repeatable)', (v: string, acc: string[]) => [...acc, v], [])
    .option('--crap4ts-bin <path>', 'explicit crap4ts binary')
    .option('--dry4ts-bin <path>', 'explicit dry4ts binary')
    .option('--arch4ts-bin <path>', 'explicit arch4ts binary')
    .option('--no-open', 'do not open the browser (serve)')
    .option('--defer-scan', 'start server without scanning (serve)');
  program
    .command('scan [path]', { hidden: true })
    .allowExcessArguments(false)
    .action((positional: string | undefined) => { config.command = 'scan'; config.positional = positional ?? null; });
  program
    .command('serve [path]', { hidden: true })
    .allowExcessArguments(false)
    .action((positional: string | undefined) => { config.command = 'serve'; config.positional = positional ?? null; });

  try {
    program.parse(argv, { from: 'user' });
  } catch (e) {
    throw remapCommanderError(e, argv[0]);
  }

  if (config.command === 'help') return config;
  const o = program.opts<{ [k: string]: unknown }>();
  config.out = (o.out as string | undefined) ?? null;
  config.port = o.port as number;
  config.noOpen = o.open === false;
  config.deferScan = o.deferScan === true;
  config.maxCrap = o.maxCrap as number;
  config.dryThreshold = o.dryThreshold as number;
  config.coverageCommand = (o.coverageCommand as string | undefined) ?? null;
  config.useExistingCoverage = o.useExistingCoverage === true;
  config.lcov = (o.lcov as string[]) ?? [];
  config.bins = {
    crap4ts: o.crap4tsBin as string | undefined,
    dry4ts: o.dry4tsBin as string | undefined,
    arch4ts: o.arch4tsBin as string | undefined,
  };
  if (config.command === 'scan' && !config.out && config.positional !== null) throw new CliError('scan requires --out <file>');
  return config;
}

function remapCommanderError(e: unknown, first: string | undefined): CliError {
  if (e instanceof CliError) return e;
  if (e instanceof CommanderError) {
    const quoted = e.message.match(/'([^']+)'/)?.[1] ?? '';
    switch (e.code) {
      case 'commander.unknownCommand':
        return new CliError(`unknown command: ${first} (expected scan or serve)`);
      case 'commander.unknownOption':
        return new CliError(`unknown flag: ${quoted}`);
      case 'commander.excessArguments':
        return new CliError('unexpected extra argument');
      case 'commander.missingMandatoryOptionValue':
      case 'commander.optionRequiresArgument':
        return new CliError(`${quoted.split(' ')[0]} requires a value`);
      default:
        return new CliError(e.message.replace(/^error: /, ''));
    }
  }
  throw e;
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
    const extended = extendedHelp(argv);
    if (extended) {
      process.stdout.write(extended + '\n');
      return 0;
    }
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
  main(process.argv.slice(2)).then((code) => {
    if (code !== 0) process.exitCode = code;
  }).catch((e: unknown) => {
    process.stderr.write(String((e as Error).stack ?? e) + '\n');
    process.exitCode = 1;
  });
}
