export type Risk = 'low' | 'moderate' | 'high' | 'unknown';

export interface FunctionFinding {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
  cc: number;
  coverage: number | null;
  crap: number | null;
  risk: Risk;
  dupes: { otherFile: string; otherName: string; otherStartLine: number; score: number }[];
}

export interface Location {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
}

export interface DuplicatePair {
  score: number;
  left: Location;
  right: Location;
}

export interface ModuleRollup {
  module: string;
  sourceFiles: string[];
  functionCount: number;
  worstCrap: number | null;
  bands: { low: number; moderate: number; high: number; unknown: number };
  dupePairs: number;
  abstract: boolean;
}

export interface ArchitectureDump {
  architecture: {
    graph: { nodes: string[]; edges: { from: string; to: string }[] };
    abstractModules: string[];
    moduleToSourceFile: Record<string, string>;
  };
  layering: unknown;
}

export interface ReportDataset {
  meta: {
    generatedAt: string;
    target: string;
    thresholds: { maxCrap: number; dryThreshold: number };
    tools: { arch4ts: string | null; crap4ts: string | null; dry4ts: string | null };
  };
  architecture: ArchitectureDump;
  functions: FunctionFinding[];
  duplicates: DuplicatePair[];
  modules: ModuleRollup[];
  unattributed: { files: string[]; functionCount: number };
}
