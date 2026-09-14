import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { discoverBin } from '../orchestrate/discover.js';
import { runArch4tsDump } from '../orchestrate/arch_dump.js';
import { runSiblingTool } from '../orchestrate/run_tool.js';
import { buildReport } from '../merge/report.js';
import { CliError } from '../cli-error.js';
import type { ReportDataset } from '../types.js';

export interface ScanOptions {
  maxCrap?: number;
  dryThreshold?: number;
  coverage?: { lcov?: string[]; command?: string; useExisting?: boolean };
  bins?: { crap4ts?: string; dry4ts?: string; arch4ts?: string };
}

export class ScanService {
  private readonly root: string;
  private readonly maxCrap: number;
  private readonly dryThreshold: number;
  private readonly coverage: ScanOptions['coverage'];
  private readonly bins: { crap4ts: string; dry4ts: string; arch4ts: string };
  private dataset: ReportDataset | null = null;

  constructor(projectRoot: string, options: ScanOptions = {}) {
    this.root = resolve(projectRoot);
    this.maxCrap = options.maxCrap ?? 30;
    this.dryThreshold = options.dryThreshold ?? 0.82;
    this.coverage = options.coverage;
    this.bins = {
      crap4ts: options.bins?.crap4ts ?? discoverBin('crap4ts'),
      dry4ts: options.bins?.dry4ts ?? discoverBin('dry4ts'),
      arch4ts: options.bins?.arch4ts ?? discoverBin('arch4ts'),
    };
  }

  async scan(): Promise<ReportDataset> {
    if (this.dataset) return this.dataset;
    const tmp = mkdtempSync(join(tmpdir(), 'q4ts-scan-'));
    try {
      const archFile = join(tmp, 'arch.json');
      const archRaw = await runArch4tsDump(this.bins.arch4ts, this.root, archFile);
      const crapRaw = await runSiblingTool(this.bins.crap4ts, this.crap4tsArgs());
      const dryRaw = await runSiblingTool(this.bins.dry4ts, [
        '--source-root', this.root,
        '--format', 'json',
        '--threshold', String(this.dryThreshold),
      ]);
      this.dataset = buildReport({
        target: this.root,
        thresholds: { maxCrap: this.maxCrap, dryThreshold: this.dryThreshold },
        architectureRaw: archRaw,
        crapRaw,
        dryRaw,
        generatedAt: new Date().toISOString(),
      });
      return this.dataset;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  private crap4tsArgs(): string[] {
    const args = ['--source-root', this.root, '--format', 'json', '--threshold', String(this.maxCrap)];
    for (const f of this.coverage?.lcov ?? []) args.push('--lcov', f);
    if (this.coverage?.command) args.push('--coverage-command', this.coverage.command);
    if (this.coverage?.useExisting) args.push('--use-existing-coverage');
    return args;
  }

  async reanalyze(): Promise<ReportDataset> {
    this.dataset = null;
    return this.scan();
  }

  readSource(file: string): { content: string; totalLines: number } {
    if (isAbsolute(file) || file.includes('\u0000')) throw new CliError(`invalid source path: ${file}`);
    const abs = resolve(normalize(join(this.root, file)));
    if (!abs.startsWith(this.root + sep)) throw new CliError(`path escapes project root: ${file}`);
    const content = readFileSync(abs, 'utf8');
    return { content, totalLines: content.split('\n').length };
  }
}
