import { CliError } from '../cli-error.js';
import type { DuplicatePair, FunctionFinding, Risk, Location } from '../types.js';

const RISKS: Risk[] = ['low', 'moderate', 'high', 'unknown'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new CliError(`malformed: '${field}' must be a non-empty string`);
  return v;
}

function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CliError(`malformed: '${field}' must be a finite number`);
  return v;
}

function numOrNull(v: unknown, field: string): number | null {
  return v === null ? null : num(v, field);
}

function parseLocation(v: unknown, side: string): Location {
  if (!isObj(v)) throw new CliError(`malformed: '${side}' must be an object`);
  return {
    file: str(v.file, `${side}.file`),
    name: str(v.name, `${side}.name`),
    startLine: num(v.startLine, `${side}.startLine`),
    endLine: num(v.endLine, `${side}.endLine`),
  };
}

export function parseCrap4ts(raw: unknown): FunctionFinding[] {
  if (!Array.isArray(raw)) throw new CliError('malformed: expected an array of scored functions');
  return raw.map((item): FunctionFinding => {
    if (!isObj(item)) throw new CliError('malformed: each function entry must be an object');
    const risk = item.risk;
    if (typeof risk !== 'string' || !RISKS.includes(risk as Risk)) {
      throw new CliError(`malformed: 'risk' must be one of ${RISKS.join('|')}`);
    }
    return {
      file: str(item.file, 'file'),
      name: str(item.name, 'name'),
      startLine: num(item.startLine, 'startLine'),
      endLine: num(item.endLine, 'endLine'),
      cc: num(item.cc, 'cc'),
      coverage: numOrNull(item.coverage, 'coverage'),
      crap: numOrNull(item.crap, 'crap'),
      risk: risk as Risk,
      dupes: [],
    };
  });
}

export function parseDry4ts(raw: unknown): DuplicatePair[] {
  if (!Array.isArray(raw)) throw new CliError('malformed: expected an array of duplicate pairs');
  return raw.map((item): DuplicatePair => {
    if (!isObj(item)) throw new CliError('malformed: each pair must be an object');
    return { score: num(item.score, 'score'), left: parseLocation(item.left, 'left'), right: parseLocation(item.right, 'right') };
  });
}

export function alignDuplicates(functions: FunctionFinding[], pairs: DuplicatePair[]): FunctionFinding[] {
  const out = functions.map((f) => ({ ...f, dupes: [...f.dupes] }));
  const byLine = new Map<string, FunctionFinding>();
  const byName = new Map<string, FunctionFinding>();
  for (const f of out) {
    byLine.set(`${f.file}\u0000${f.startLine}`, f);
    byName.set(`${f.file}\u0000${f.name}`, f);
  }
  const attach = (pair: DuplicatePair, from: Location, to: Location): void => {
    const f =
      byLine.get(`${from.file}\u0000${from.startLine}`) ??
      byName.get(`${from.file}\u0000${from.name}`);
    if (!f) return;
    f.dupes.push({ otherFile: to.file, otherName: to.name, otherStartLine: to.startLine, score: pair.score });
  };
  for (const pair of pairs) {
    attach(pair, pair.left, pair.right);
    attach(pair, pair.right, pair.left);
  }
  return out;
}
