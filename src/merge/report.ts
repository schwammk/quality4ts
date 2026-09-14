import { CliError } from '../cli-error.js';
import { alignDuplicates, parseCrap4ts, parseDry4ts } from './ingest.js';
import { buildModuleRollups } from './rollup.js';
import type { ArchitectureDump, DuplicatePair, FunctionFinding, ReportDataset } from '../types.js';
import { isAbsolute, relative, sep } from 'node:path';

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

// crap4ts and dry4ts emit absolute file paths while arch4ts module names
// (and moduleToSourceFile values) are relative to the scan target —
// normalize every sibling-emitted path to a POSIX path under the target
// so alignment and module attribution work.
function relativizeFiles(target: string, files: string[]): string[] {
  return files.map((file) => {
    if (!isAbsolute(file)) return file;
    const rel = relative(target, file);
    if (rel.startsWith('..') || isAbsolute(rel)) return file;
    return rel.split(sep).join('/');
  });
}

function relativizeCrap(target: string, functions: FunctionFinding[]): FunctionFinding[] {
  const files = relativizeFiles(target, functions.map((f) => f.file));
  return functions.map((f, i) => ({ ...f, file: files[i] }));
}

function relativizeDry(target: string, pairs: DuplicatePair[]): DuplicatePair[] {
  return pairs.map((p) => ({ ...p, left: { ...p.left, file: toRel(target, p.left.file) }, right: { ...p.right, file: toRel(target, p.right.file) } }));
}

function toRel(target: string, file: string): string {
  return relativizeFiles(target, [file])[0];
}

export function buildReport(input: ReportInput): ReportDataset {
  const architecture = parseArchitecture(input.architectureRaw);
  let functions = relativizeCrap(input.target, parseCrap4ts(input.crapRaw));
  const duplicates = relativizeDry(input.target, parseDry4ts(input.dryRaw));
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
