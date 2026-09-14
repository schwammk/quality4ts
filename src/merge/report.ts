import { CliError } from '../cli-error.js';
import { alignDuplicates, parseCrap4ts, parseDry4ts } from './ingest.js';
import { buildModuleRollups } from './rollup.js';
import type { ArchitectureDump, ReportDataset } from '../types.js';

export interface ReportInput {
  target: string;
  thresholds: { maxCrap: number; dryThreshold: number };
  architectureRaw: unknown;
  crapRaw: unknown;
  dryRaw: unknown;
  generatedAt: string;
}

function parseArchitecture(raw: unknown): ArchitectureDump {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('malformed: arch4ts dump must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.architecture !== 'object' || obj.architecture === null || Array.isArray(obj.architecture)) {
    throw new CliError('malformed: arch4ts dump lacks an architecture object');
  }
  const arch = obj.architecture as Record<string, unknown>;
  if (typeof arch.graph !== 'object' || arch.graph === null || Array.isArray(arch.graph)) {
    throw new CliError('malformed: arch4ts dump lacks a graph object');
  }
  return raw as ArchitectureDump;
}

export function buildReport(input: ReportInput): ReportDataset {
  const architecture = parseArchitecture(input.architectureRaw);
  let functions = parseCrap4ts(input.crapRaw);
  const duplicates = parseDry4ts(input.dryRaw);
  functions = alignDuplicates(functions, duplicates);
  const { modules, unattributed } = buildModuleRollups(architecture, functions, duplicates);
  return {
    meta: {
      generatedAt: input.generatedAt,
      target: input.target,
      thresholds: input.thresholds,
      tools: { arch4ts: null, crap4ts: null, dry4ts: null },
    },
    architecture,
    functions,
    duplicates,
    modules,
    unattributed,
  };
}
